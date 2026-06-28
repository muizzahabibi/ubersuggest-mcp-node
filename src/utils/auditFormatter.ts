export function formatSiteAuditMarkdown(
  domainUrl: string,
  pagespeed: any,
  seoOpportunities: any,
  googleServicesStatus?: any
): string {
  let md = `## 📊 SEO Technical Audit: ${domainUrl}\n\n`;

  // 1. SEO Health Summary
  md += `### 🎯 SEO Health Summary\n`;
  const siteAuditCounts = seoOpportunities?.opportunities_count?.SITE_AUDIT || {};
  const totalIssues = Object.values(siteAuditCounts).reduce((acc: number, val: any) => acc + (Number(val) || 0), 0) as number;

  md += `- **Total Issues Detected:** ${totalIssues}\n`;
  if (totalIssues > 0) {
    const issueBreakdown = Object.entries(siteAuditCounts)
      .filter(([_, count]) => (count as number) > 0)
      .map(([name, count]) => `${name.replace(/_/g, ' ')} (${count})`)
      .join(', ');
    md += `- **Issues List:** ${issueBreakdown || 'None'}\n`;
  } else {
    md += `- Excellent! No major site crawl errors detected.\n`;
  }
  md += `\n`;

  // 2. PageSpeed Core Web Vitals
  md += `### ⚡ PageSpeed Core Web Vitals\n`;
  const report = pagespeed?.report || {};
  const devices = Object.keys(report);
  if (devices.length > 0) {
    const formatVal = (val: any, suffix: string, div = 1, fixed = 2) => {
      const num = Number(val);
      return !isNaN(num) ? `${(num / div).toFixed(fixed)}${suffix}` : 'N/A';
    };
    for (const [device, data] of Object.entries(report)) {
      const labData = (data as any)?.labData || {};
      const lcp = labData['largest-contentful-paint']?.numericValue;
      const tbt = labData['total-blocking-time']?.numericValue;
      const cls = labData['cumulative-layout-shift']?.numericValue;
      const fcp = labData['first-contentful-paint']?.numericValue;

      md += `#### ${device === 'DESKTOP' ? '💻 Desktop' : '📱 Mobile'}\n`;
      if (lcp !== undefined || tbt !== undefined || cls !== undefined || fcp !== undefined) {
        md += `- **Largest Contentful Paint (LCP):** ${formatVal(lcp, 's', 1000, 2)}\n`;
        md += `- **Total Blocking Time (TBT):** ${formatVal(tbt, 'ms', 1, 0)}\n`;
        md += `- **Cumulative Layout Shift (CLS):** ${formatVal(cls, '', 1, 3)}\n`;
        md += `- **First Contentful Paint (FCP):** ${formatVal(fcp, 's', 1000, 2)}\n`;
      } else {
        md += `- Speed report unavailable or loading error.\n`;
      }
      md += `\n`;
    }
  } else {
    md += `*No PageSpeed data available.*\n\n`;
  }

  // 3. Top Actionable Opportunities
  md += `### 🛠️ Top Actionable Issues (Priority order)\n`;
  const opportunities = seoOpportunities?.opportunities || [];
  const siteOpportunities = opportunities.filter((op: any) => op.type === 'SITE_AUDIT');

  // Sort by High Impact and Easy Difficulty
  const sorted = siteOpportunities.sort((a: any, b: any) => {
    const score = (op: any) => {
      let impactScore = op.item?.seo_impact === 'high' ? 3 : op.item?.seo_impact === 'medium' ? 2 : 1;
      let diffScore = op.item?.difficulty === 'easy' ? 3 : op.item?.difficulty === 'medium' ? 2 : 1;
      return impactScore * 10 + diffScore; // High impact + Easy wins first
    };
    return score(b) - score(a);
  });

  const topIssues = sorted.slice(0, 5);
  if (topIssues.length > 0) {
    topIssues.forEach((op: any, index: number) => {
      const item = op.item || {};
      const name = String(op.subtype || item.id || '').replace(/_/g, ' ');
      md += `${index + 1}. **${name}** (Count: ${item.count || 1})\n`;
      md += `   - *SEO Impact:* **${item.seo_impact || 'unknown'}** | *Fix Difficulty:* **${item.difficulty || 'unknown'}**\n`;
    });
  } else {
    md += `No outstanding actionable SEO errors to display!\n`;
  }
  md += `\n`;

  if (googleServicesStatus) {
    md += `### 🔗 Connected Google Services\n`;
    md += `- Google Analytics: ${googleServicesStatus.analyticsConnected ? 'Connected ✅' : 'Not Connected ❌'}\n`;
    md += `- Google Search Console: ${googleServicesStatus.searchConsoleConnected ? 'Connected ✅' : 'Not Connected ❌'}\n\n`;
  }

  return md;
}
