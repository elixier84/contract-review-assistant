"use client";

import { useState, useEffect, useCallback } from "react";

interface Project {
  id: number;
  name: string;
  licensor: string;
  licensee: string;
  notification_date: string | null;
  audit_scope_start: string | null;
  audit_scope_end: string | null;
}

export function useActiveProject() {
  const [projectId, setProjectId] = useState<number | null>(null);
  const [project, setProject] = useState<Project | null>(null);

  // Read from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("activeProjectId");
    if (stored) {
      setProjectId(Number(stored));
    }
  }, []);

  // Fetch project details when ID changes
  useEffect(() => {
    if (!projectId) {
      setProject(null);
      return;
    }
    fetch(`/api/projects/${projectId}`)
      .then(r => r.json())
      .then(d => setProject(d.project || null))
      .catch(() => setProject(null));
  }, [projectId]);

  const switchProject = useCallback((id: number) => {
    localStorage.setItem("activeProjectId", String(id));
    setProjectId(id);
  }, []);

  return { projectId, project, switchProject };
}
