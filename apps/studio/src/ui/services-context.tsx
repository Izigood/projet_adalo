import { createContext, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { StudioServices } from '../services.js';

const ServicesContext = createContext<StudioServices | null>(null);

/**
 * Hands the services to the components, and saves what waits for the delay as soon as the page goes
 * to the background: a tab that is closed from there has no time to wait for 2 seconds (ADR-0037).
 */
export function StudioProvider(props: { services: StudioServices; children: ReactNode }) {
  const { services, children } = props;
  useEffect(() => {
    const save = () => {
      if (document.visibilityState === 'hidden') void services.session.flush();
    };
    document.addEventListener('visibilitychange', save);
    window.addEventListener('pagehide', save);
    return () => {
      document.removeEventListener('visibilitychange', save);
      window.removeEventListener('pagehide', save);
    };
  }, [services]);
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): StudioServices {
  const services = useContext(ServicesContext);
  if (services === null) throw new Error('useServices needs a StudioProvider above it');
  return services;
}
