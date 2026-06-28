import { UbersuggestClient } from '../../client/ubersuggestClient.js'
import type { KeywordMetric, KeywordResearchResponse } from '../types/endpoints.js'
import { pollUntil } from '../../utils/polling.js'

const MAX_KEYWORDS_PER_BATCH = 3

export class KeywordService {
  constructor(
    private readonly client: UbersuggestClient,
    private readonly pollIntervalMs: number,
    private readonly pollTimeoutMs: number,
  ) {}

  async runKeywordResearch(input: {
    keywords: string[]
    locId: number
    language: string
    sortby?: string
    limit?: number
    filters?: Record<string, unknown>
    domain?: string
  }): Promise<KeywordResearchResponse> {
    const batches = chunkKeywords(input.keywords, MAX_KEYWORDS_PER_BATCH)
    const results: KeywordResearchResponse[] = []

    for (const keywords of batches) {
      results.push(await this.runKeywordResearchBatch({ ...input, keywords }))
    }

    return {
      searched_keywords: dedupeKeywordMetrics(results.flatMap((result) => result.searched_keywords)),
      suggestions: dedupeKeywordMetrics(results.flatMap((result) => result.suggestions)),
      suggestionCount: results.reduce((total, result) => total + result.suggestionCount, 0),
      report: mergeReports(results.map((result) => result.report).filter((report): report is Record<string, unknown> => Boolean(report))),
    }
  }

  private async runKeywordResearchBatch(input: {
    keywords: string[]
    locId: number
    language: string
    sortby?: string
    limit?: number
    filters?: Record<string, unknown>
    domain?: string
  }): Promise<KeywordResearchResponse> {
    const matchKeywords = await this.client.post<Record<string, unknown>>('/api/match_keywords', {
      feature: 'keyword',
      body: {
        keywords: input.keywords,
        locId: input.locId,
        language: input.language,
        sortby: input.sortby ?? '-searchVolume',
        limit: input.limit ?? 300,
        previousKey: 0,
        filters: input.filters ?? {},
        domain: input.domain ?? '',
      },
    })

    const suggestionKeywords = Array.isArray(matchKeywords.data.suggestions)
      ? (matchKeywords.data.suggestions as Array<Record<string, unknown>>).map((item) => String(item.keyword ?? '')).filter(Boolean)
      : []

    await this.client.post<unknown>('/api/keyword_suggestions_info', {
      feature: 'keyword',
      body: {
        keywords: Object.fromEntries(
          input.keywords.map((keyword) => [
            keyword,
            {
              suggestions: suggestionKeywords,
              comparisons: [],
              prepositions: [],
              questions: [],
            },
          ]),
        ),
        language: input.language,
        locId: input.locId,
      },
    })

    const taskStatus = await pollUntil(
      async () =>
        this.client.post<Record<string, unknown>>('/api/keyword_suggestions_info_task_status', {
          feature: 'keyword',
          body: {
            keywords: input.keywords,
            language: input.language,
            locId: input.locId,
            filters: input.filters ?? {},
            sortby: input.sortby ?? '-searchVolume',
          },
        }),
      (result) => Boolean(result.data.done),
      this.pollIntervalMs,
      this.pollTimeoutMs,
    )

    return {
      searched_keywords: Array.isArray(matchKeywords.data.searched_keywords)
        ? (matchKeywords.data.searched_keywords as Array<Record<string, unknown>>).map(toKeywordMetric)
        : [],
      suggestions: Array.isArray(matchKeywords.data.suggestions)
        ? (matchKeywords.data.suggestions as Array<Record<string, unknown>>).map(toKeywordMetric)
        : [],
      suggestionCount: Number(matchKeywords.data.suggestionCount ?? 0),
      report:
        taskStatus.data.report && typeof taskStatus.data.report === 'object'
          ? (taskStatus.data.report as Record<string, unknown>)
          : undefined,
    }
  }
}

function chunkKeywords(keywords: string[], size: number): string[][] {
  const chunks: string[][] = []

  for (let index = 0; index < keywords.length; index += size) {
    chunks.push(keywords.slice(index, index + size))
  }

  return chunks
}

function dedupeKeywordMetrics(metrics: KeywordMetric[]): KeywordMetric[] {
  const deduped = new Map<string, KeywordMetric>()

  for (const metric of metrics) {
    if (!metric.keyword) continue
    deduped.set(metric.keyword, metric)
  }

  return [...deduped.values()]
}

function mergeReports(reports: Record<string, unknown>[]): Record<string, unknown> | undefined {
  if (reports.length === 0) return undefined
  if (reports.length === 1) return reports[0]

  return {
    batches: reports,
  }
}

function toKeywordMetric(metric: Record<string, unknown>): KeywordMetric {
  return {
    keyword: String(metric.keyword ?? ''),
    competition: Number(metric.competition ?? 0),
    volume: Number(metric.volume ?? 0),
    cpc: Number(metric.cpc ?? 0),
    cpcDollars: Number(metric.cpcDollars ?? 0),
    sd: Number(metric.sd ?? 0),
    updated_at: Number(metric.updated_at ?? 0),
    pd: Number(metric.pd ?? 0),
    searchIntent: metric.searchIntent === null ? null : String(metric.searchIntent ?? ''),
  }
}
