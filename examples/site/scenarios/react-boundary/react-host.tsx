import { createRoot } from 'react-dom/client';

function Counter() {
  return <button onClick={() => alert('React owns this island')}>Interactive island</button>;
}

const island = document.getElementById('counter');
if (island === null) throw new Error('the page has no element #counter');
createRoot(island).render(<Counter />);
