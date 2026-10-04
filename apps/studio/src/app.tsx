import type { StudioServices } from './services.js';
import { Shell } from './ui/shell.js';
import { StudioProvider } from './ui/services-context.js';
import './app.css';

/** The Studio: the services, and the shell that shows them. */
export function App(props: { services: StudioServices }) {
  return (
    <StudioProvider services={props.services}>
      <Shell />
    </StudioProvider>
  );
}
