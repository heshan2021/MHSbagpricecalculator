/* Entry point for index.html - the two-card chooser. It is plain markup, but it is built by
   Vite like the other two pages so all three ship together. */
import { createRoot } from 'react-dom/client';
import { Home } from '../pages/Home.tsx';

const container = document.body;
container.replaceChildren();
createRoot(container).render(<Home />);
