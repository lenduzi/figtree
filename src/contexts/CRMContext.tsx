import { createContext, useContext, ReactNode } from 'react';
import { useCRM } from '@/hooks/useCRM';

type CRMContextType = ReturnType<typeof useCRM>;

const CRMContext = createContext<CRMContextType | null>(null);

export function CRMProvider({ children }: { children: ReactNode }) {
  const crm = useCRM();
  return <CRMContext.Provider value={crm}>{children}</CRMContext.Provider>;
}

export function useCRMContext() {
  const context = useContext(CRMContext);
  if (!context) {
    throw new Error('useCRMContext must be used within a CRMProvider');
  }
  return context;
}
