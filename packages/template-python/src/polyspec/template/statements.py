"""Expression evaluation (docs/spec/expressions.md) and statement rendering
(RT-11 to RT-32)."""

from __future__ import annotations

from typing import Optional

from .context import Frame, LoopMeta, RenderContext, Scope
from .loader import PathError, resolve_path
from .runtime_bindings import RuntimeBindings
from .values import Value


class Evaluator:
    def __init__(self, context: RenderContext, runtime: 'RuntimeBindings | None' = None):
        self.runtime = runtime or RuntimeBindings(context)
        self._depth = 0
        self._scope = Scope()

    def evaluate(self, expr: dict, frame: Frame, scope: 'Scope | None' = None) -> Value:
        if scope is not None:
            self._scope = scope
        self._depth += 1
        self.runtime.limit('expression', self._depth, frame, expr['span'])
        try:
            return self._evaluate_node(expr, frame)
        finally:
            self._depth -= 1

    def _evaluate_node(self, expr: dict, frame: Frame) -> Value:
        kind = expr['type']
        if kind == 'Literal':
            return expr['value']
        if kind == 'Var':
            return self._scope.lookup(frame, expr['name'])
        if kind == 'LoopMeta':
            meta = self._scope.loop_meta(expr['loop'])
            if meta is None:
                raise self.runtime.error(frame, expr['span'], 'E_RUNTIME_UNKNOWN_LOOP',
                                         f"{expr['loop']} is not an active loop variable")
            field = expr['field']
            if field == 'index_':
                return meta.index_
            if field == 'key_':
                return meta.key_
            if field == 'value_':
                return meta.value_
            if field == 'first_':
                return meta.first_
            if field == 'last_':
                return meta.last_
            return float(meta.size_)
        if kind == 'Member':
            return self.runtime.member(self.evaluate(expr['object'], frame), expr['key'],
                                       frame, expr['span'])
        if kind == 'MemberCall':
            return self.runtime.member_call(self.evaluate(expr['object'], frame), expr['method'],
                                            [self.evaluate(arg, frame) for arg in expr['args']],
                                            frame, expr['span'])
        if kind == 'ClassCall':
            return self.runtime.class_call(expr['className'], expr['method'],
                                           [self.evaluate(arg, frame) for arg in expr['args']],
                                           frame, expr['span'])
        if kind == 'Index':
            return self.runtime.index(self.evaluate(expr['object'], frame),
                                      self.evaluate(expr['index'], frame), frame, expr['span'])
        if kind == 'Call':
            return self.runtime.call(expr['name'],
                                     [self.evaluate(arg, frame) for arg in expr['args']],
                                     frame, expr['span'])
        if kind == 'Unary':
            operand = self.evaluate(expr['operand'], frame)
            return self.runtime.unary(expr['op'], operand, frame, expr['span'])
        if kind == 'Binary':
            return self._binary(expr, frame)
        if kind == 'Ternary':
            test = self.evaluate(expr['test'], frame)
            if expr['then'] is None:
                return test if self.runtime.truthy(test) else self.evaluate(expr['else'], frame)
            return (self.evaluate(expr['then'], frame) if self.runtime.truthy(test)
                    else self.evaluate(expr['else'], frame))
        if kind == 'List':
            items: list = []
            for item in expr['items']:
                if item['type'] == 'Spread':
                    items.extend(self.runtime.list_spread(self.evaluate(item['expr'], frame),
                                                          frame, item['span']))
                else:
                    items.append(self.evaluate(item, frame))
            return self.runtime.depth(items, frame, expr['span'])
        if kind == 'Map':
            mapping: dict[str, Value] = {}
            for entry in expr['entries']:
                if 'expr' in entry:
                    for key, value in self.runtime.map_spread(
                            self.evaluate(entry['expr'], frame), frame,
                            entry['span']).items():
                        mapping[key] = value
                else:
                    key = self.runtime.stringify(self.evaluate(entry['key'], frame), frame,
                                                 entry['key']['span'])
                    mapping[key] = self.evaluate(entry['value'], frame)
            return self.runtime.depth(mapping, frame, expr['span'])
        raise self.runtime.error(frame, expr['span'], 'E_INTERNAL',
                                 f'unknown expression node {kind}')

    def _binary(self, expr: dict, frame: Frame) -> Value:
        operator = expr['op']
        if operator == '&&':
            left = self.evaluate(expr['left'], frame)
            return self.runtime.truthy(self.evaluate(expr['right'], frame)) \
                if self.runtime.truthy(left) else False
        if operator == '||':
            left = self.evaluate(expr['left'], frame)
            return True if self.runtime.truthy(left) else \
                self.runtime.truthy(self.evaluate(expr['right'], frame))
        if operator == '??':
            left = self.evaluate(expr['left'], frame)
            return left if left is not None else self.evaluate(expr['right'], frame)
        left = self.evaluate(expr['left'], frame)
        right = self.evaluate(expr['right'], frame)
        return self.runtime.binary(operator, left, right, frame, expr['span'])


class Renderer:
    def __init__(self, context: RenderContext, program):
        self.context = context
        self.program = program
        self.evaluator = Evaluator(context)

    def render_nodes(self, nodes: list, frame: Frame, scope: Scope) -> None:
        for node in nodes:
            self._render_node(node, frame, scope)

    def _render_node(self, node: dict, frame: Frame, scope: Scope) -> None:
        self.context.at(frame, node['span'])
        kind = node['type']
        if kind == 'Text':
            self.context.output.write(node['value'])
        elif kind == 'Echo':
            value = self.evaluator.evaluate(node['expr'], frame, scope)
            self.context.output.write(
                self.evaluator.runtime.escape(value, frame, node['expr']['span']))
        elif kind == 'If':
            self._render_if(node, frame, scope)
        elif kind == 'For':
            self._render_for(node, frame, scope)
        elif kind == 'Set':
            scope.locals[node['name']] = self.evaluator.evaluate(node['expr'], frame, scope)
        elif kind == 'Include':
            self._render_include(node['path'], node['span'], frame, scope)
        elif kind == 'Block':
            self._render_block(node, frame, scope)
        elif kind == 'IfBlock':
            self._render_if_block(node, frame, scope)
        else:
            raise self.context.fail('E_INTERNAL', frame, node['span'],
                                    f'unknown statement node {kind}')

    def _render_if(self, node: dict, frame: Frame, scope: Scope) -> None:
        for branch in node['branches']:
            test = self.evaluator.evaluate(branch['test'], frame, scope)
            if self.evaluator.runtime.truthy(test):
                self.render_nodes(branch['body'], frame, scope)
                return
        if node['else'] is not None:
            self.render_nodes(node['else'], frame, scope)

    def _render_for(self, node: dict, frame: Frame, scope: Scope) -> None:
        iterable = self.evaluator.evaluate(node['iter'], frame, scope)
        entries = self.evaluator.runtime.entries(iterable, frame, node['span'])

        if not entries:
            if node['empty'] is not None:
                self.render_nodes(node['empty'], frame, scope)
            return
        name = node['name']
        had_local = name in scope.locals
        previous = scope.locals.get(name)
        stack = scope.loops.setdefault(name, [])
        meta = LoopMeta(len(entries))
        stack.append(meta)
        try:
            for index, (key, value) in enumerate(entries):
                self.context.iterations += 1
                self.evaluator.runtime.limit('iteration', self.context.iterations, frame,
                                             node['span'])
                meta.index_ = float(index)
                meta.key_ = key
                meta.value_ = value
                meta.first_ = index == 0
                meta.last_ = index == len(entries) - 1
                scope.locals[name] = value
                self.render_nodes(node['body'], frame, scope)
        finally:
            stack.pop()
            if had_local:
                scope.locals[name] = previous
            else:
                scope.locals.pop(name, None)

    def _resolve(self, path: str, frame: Frame, span) -> str:
        try:
            return resolve_path(frame.name, path)
        except PathError as error:
            raise self.context.fail('E_LOAD_OUTSIDE_ROOT', frame, span, str(error)) from None

    def _render_include(self, path: str, span, frame: Frame, scope: Scope) -> None:
        name = self._resolve(path, frame, span)
        template = self.program.load_template(name, frame, span)
        self.context.enter(name, frame, span)
        try:
            included = Frame(template['ast']['name'], template['lines'], frame.context)
            self.render_nodes(template['ast']['body'], included, scope)
        finally:
            self.context.leave()

    def _render_block(self, node: dict, frame: Frame, scope: Scope) -> None:
        registry = self.context.registry
        if node['id'] is not None and node['path'] is None:
            entry = registry.get(node['id'])
            if entry is None:
                raise self.context.fail('E_RUNTIME_BLOCK_UNDEFINED', frame, node['span'],
                                        f"define {node['id']} is not registered")
        else:
            name = self._resolve(node['path'], frame, node['span'])
            if node['id'] is not None:
                registered = registry.get(node['id'])
                if registered is not None:
                    if 'html' in registered or registered['template'] != name:
                        raise self.context.fail('E_RUNTIME_BLOCK_REDEFINED', frame, node['span'],
                                                f"define {node['id']} is registered with a "
                                                'different template')
                    entry = registered
                else:
                    entry = {'template': name, 'data': None}
                    registry[node['id']] = entry
            else:
                entry = {'template': name, 'data': None}
        if 'html' in entry:
            self.context.output.write(entry['html'])
            return
        data = dict(self.context.root_data)
        if entry['data']:
            for key, value in entry['data'].items():
                data[key] = value
        for item in node['scope']:
            data[item['name']] = self.evaluator.evaluate(item['expr'], frame, scope)
        template = self.program.load_template(entry['template'], frame, node['span'])
        self.context.enter(entry['template'], frame, node['span'])
        try:
            self.render_nodes(template['ast']['body'],
                              Frame(template['ast']['name'], template['lines'], data), Scope())
        finally:
            self.context.leave()

    def _render_if_block(self, node: dict, frame: Frame, scope: Scope) -> None:
        if node['id'] in self.context.registry:
            self.render_nodes(node['body'], frame, scope)
        elif node['else'] is not None:
            self.render_nodes(node['else'], frame, scope)
