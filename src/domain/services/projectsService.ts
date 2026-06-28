import { UbersuggestClient } from '../../client/ubersuggestClient.js'
import type { ProjectRecord } from '../types/endpoints.js'

export class ProjectsService {
  constructor(private readonly client: UbersuggestClient) {}

  async listProjects(): Promise<{ projects: ProjectRecord[] }> {
    const response = await this.client.get<{ projects?: Array<Record<string, unknown>> }>('/api/projects', {
      feature: 'bootstrap',
    })

    return {
      projects: (response.data.projects ?? []).map((project) => ({
        id: String(project.id ?? ''),
        domain: String(project.domain ?? ''),
        title: String(project.title ?? ''),
        locations: Array.isArray(project.locations)
          ? project.locations
              .filter((item): item is { loc_id: number; lang: string } => Boolean(item && typeof item === 'object'))
              .map((item) => ({
                loc_id: Number(item.loc_id),
                lang: String(item.lang),
              }))
          : [],
      })),
    }
  }
}
