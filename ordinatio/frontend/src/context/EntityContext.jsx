import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

const EntityContext = createContext(null);

export function EntityProvider({ children }) {
  const { isAuthenticated } = useAuth();

  const [models, setModels] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [virtualKeys, setVirtualKeys] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [ruleTemplates, setRuleTemplates] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const refreshModels = useCallback(async () => {
    try {
      const data = await api.getModels();
      if (Array.isArray(data)) setModels(data);
    } catch (err) {
      console.warn('Failed to fetch models from SSOT:', err);
    }
  }, []);

  const refreshTenants = useCallback(async () => {
    try {
      const data = await api.getTenants();
      if (Array.isArray(data)) setTenants(data);
    } catch (err) {
      console.warn('Failed to fetch tenants from SSOT:', err);
    }
  }, []);

  const refreshVirtualKeys = useCallback(async () => {
    try {
      const data = await api.getVirtualKeys();
      if (Array.isArray(data)) setVirtualKeys(data);
    } catch (err) {
      console.warn('Failed to fetch virtual keys from SSOT:', err);
    }
  }, []);

  const refreshRoutes = useCallback(async () => {
    try {
      const data = await api.getRoutes();
      if (Array.isArray(data)) setRoutes(data);
    } catch (err) {
      console.warn('Failed to fetch routes from SSOT:', err);
    }
  }, []);

  const refreshRuleTemplates = useCallback(async () => {
    try {
      const data = await api.getRuleTemplates();
      if (data && typeof data === 'object') setRuleTemplates(data);
    } catch (err) {
      console.warn('Failed to fetch rule templates from SSOT:', err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    await Promise.allSettled([
      refreshModels(),
      refreshTenants(),
      refreshVirtualKeys(),
      refreshRoutes(),
      refreshRuleTemplates()
    ]);
    setIsLoading(false);
  }, [isAuthenticated, refreshModels, refreshTenants, refreshVirtualKeys, refreshRoutes, refreshRuleTemplates]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshAll();
    } else {
      setModels([]);
      setTenants([]);
      setVirtualKeys([]);
      setRoutes([]);
      setRuleTemplates({});
    }
  }, [isAuthenticated, refreshAll]);

  return (
    <EntityContext.Provider value={{
      models,
      tenants,
      virtualKeys,
      routes,
      ruleTemplates,
      isLoading,
      refreshModels,
      refreshTenants,
      refreshVirtualKeys,
      refreshRoutes,
      refreshRuleTemplates,
      refreshAll
    }}>
      {children}
    </EntityContext.Provider>
  );
}

export function useEntities() {
  const context = useContext(EntityContext);
  if (!context) {
    throw new Error('useEntities must be used within an EntityProvider');
  }
  return context;
}
