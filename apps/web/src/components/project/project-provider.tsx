'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { ProjectResponse, CreateProjectInput } from '@replaylab/contracts';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { useAuth } from '@/components/auth/auth-provider';

export interface ProjectContextValue {
  projects: ProjectResponse[];
  activeProject: ProjectResponse | null;
  isLoading: boolean;
  error: string | null;
  setActiveProjectId: (projectId: string) => void;
  refreshProjects: () => Promise<void>;
  createProject: (input: CreateProjectInput) => Promise<ProjectResponse>;
  deleteProject: (projectId: string) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

const STORAGE_KEY = 'replaylab_active_project_id';

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY);
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    let activeAuthToken = token;
    if (!activeAuthToken && typeof window !== 'undefined') {
      activeAuthToken = sessionStorage.getItem('replaylab_dev_token');
    }

    if (!activeAuthToken) {
      setProjects([]);
      setActiveProjectIdState(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.get<ProjectResponse[]>('/projects', { token: activeAuthToken });
      setProjects(data);

      // Restore stored active project or select first available
      let preferredId: string | null = null;
      if (typeof window !== 'undefined') {
        preferredId = localStorage.getItem(STORAGE_KEY);
      }

      if (preferredId && data.some((p) => p.id === preferredId)) {
        setActiveProjectIdState(preferredId);
      } else if (data.length > 0) {
        const firstId = data[0]?.id ?? null;
        setActiveProjectIdState(firstId);
        if (firstId && typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, firstId);
        }
      } else {
        setActiveProjectIdState(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(`[${err.code}] ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to fetch projects');
      }
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const setActiveProjectId = useCallback((id: string) => {
    setActiveProjectIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const createProject = useCallback(async (input: CreateProjectInput): Promise<ProjectResponse> => {
    const created = await apiClient.post<ProjectResponse>('/projects', input, { token });
    setError(null);
    setProjects((prev) => [created, ...prev]);
    setActiveProjectId(created.id);
    return created;
  }, [setActiveProjectId, token]);

  const deleteProject = useCallback(async (id: string): Promise<void> => {
    await apiClient.delete(`/projects/${id}`, { token });
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setActiveProjectIdState((curr) => {
      if (curr === id) {
        const remaining = projects.filter((p) => p.id !== id);
        const nextId = remaining[0]?.id ?? null;
        if (nextId && typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, nextId);
        } else if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY);
        }
        return nextId;
      }
      return curr;
    });
  }, [projects]);

  const activeProject = useMemo(() => {
    return projects.find((p) => p.id === activeProjectId) ?? null;
  }, [projects, activeProjectId]);

  const value = useMemo(
    () => ({
      projects,
      activeProject,
      isLoading,
      error,
      setActiveProjectId,
      refreshProjects,
      createProject,
      deleteProject,
    }),
    [projects, activeProject, isLoading, error, setActiveProjectId, refreshProjects, createProject, deleteProject]
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return ctx;
}
