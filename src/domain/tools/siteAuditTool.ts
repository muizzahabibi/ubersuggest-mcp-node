import { z } from 'zod'
import type { ToolContext } from '../../app/container.js'

const siteAuditInputSchema = z.object({
  projectId: z.string(),
  domainUrl: z.string(),
  forceUpdate: z.boolean().optional(),
  devices: z.array(z.enum(['DESKTOP', 'MOBILE'])).optional(),
  components: z.array(z.enum(['pagespeed', 'seo_opportunities', 'google_services_status'])).optional(),
})

type SiteAuditInput = z.infer<typeof siteAuditInputSchema>

export const siteAuditTool = {
  name: 'ubersuggest_site_audit',
  description: 'Get technical SEO and performance audit data for a tracked project/domain.',
  inputSchema: siteAuditInputSchema,
  outputSchema: z.object({
    pagespeed: z.record(z.string(), z.unknown()),
    seoOpportunities: z.object({
      opportunities_count: z.record(z.string(), z.unknown()),
      opportunities: z.array(z.record(z.string(), z.unknown())),
      dismissed_opportunities: z.array(z.record(z.string(), z.unknown())),
      done_opportunities: z.array(z.record(z.string(), z.unknown())),
    }),
    googleServicesStatus: z.record(z.string(), z.unknown()).optional(),
  }),
  execute: (input: SiteAuditInput, context: ToolContext) => context.services.siteAudit.getSiteAudit(input),
}
