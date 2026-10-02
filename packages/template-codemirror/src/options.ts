// Options of the template extension and the facet that carries them to every feature of the adapter.
import { Facet } from '@codemirror/state';

/** Options of {@link template}. */
export interface TemplateOptions {
  /** `indent` (default): template blocks add an indentation level. `flat`: they add none. */
  templateBlocks?: 'indent' | 'flat';
  /** Engine delimiter option as two characters (LEX-22). The default is `{}`. */
  delimiters?: string;
  /** Template name of diagnostics. The default is `template.tpl`. */
  name?: string;
}

/** The options of the first {@link template} extension of a state. */
export const templateOptions = Facet.define<TemplateOptions, TemplateOptions>({
  combine: values => values[0] ?? {},
});
