import { createRoot } from 'react-dom/client';

function Counter() {
  return <button onClick={() => alert('React owns this island')}>Interactive island</button>;
}

createRoot(document.getElementById('counter')!).render(<Counter />);
