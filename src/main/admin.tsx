/* Entry point for admin.html - the rate control panel. */
import { createRoot } from 'react-dom/client';
import { Admin } from '../pages/Admin.tsx';

const container = document.body;
container.replaceChildren();
createRoot(container).render(<Admin />);
