/* Entry point for calculator.html - mounts the React calculator onto <body>, exactly where the
   legacy page's markup lived, so the document keeps the same body classes and element order. */
import { createRoot } from 'react-dom/client';
import { Calculator } from '../pages/Calculator.tsx';

const container = document.body;
container.replaceChildren();
createRoot(container).render(<Calculator />);
