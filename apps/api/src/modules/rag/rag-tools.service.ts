import { Injectable } from "@nestjs/common";
import type { RagRoute, RagToolEvidence, RagToolResult, StructuredFact } from "./rag.types";

@Injectable()
export class RagToolsService {
  async run(opts: {
    route: RagRoute;
    facts: StructuredFact[];
    currentDate: string;
  }): Promise<RagToolResult | null> {
    const facts = opts.facts.filter((fact) => fact.domain === opts.route.domain);
    if (opts.route.domain === "resume" && opts.route.intent === "timeline") {
      return this.buildResumeTimeline(facts, opts.currentDate);
    }
    if (opts.route.domain === "ecommerce") {
      return this.buildGroupedFactSummary("ecommerce.compare", "商品事实对比", facts);
    }
    if (opts.route.domain === "ktv") {
      return this.buildGroupedFactSummary("ktv.offer_summary", "KTV 房型、套餐与预订事实", facts);
    }
    if (opts.route.domain === "foreign_trade") {
      return this.buildGroupedFactSummary("foreign_trade.terms_summary", "外贸条款与客户要求事实", facts);
    }
    if (opts.route.domain === "crm") {
      return this.buildGroupedFactSummary("crm.customer_context", "CRM 客户上下文事实", facts);
    }
    if (opts.route.domain === "collection") {
      return this.buildGroupedFactSummary("collection.days_overdue", "催收账款事实", facts);
    }
    return null;
  }

  private buildResumeTimeline(facts: StructuredFact[], currentDate: string): RagToolResult | null {
    const employments = facts
      .filter((fact) => fact.entityType === "employment")
      .map((fact) => {
        const startDate = this.textAttr(fact, "startDate");
        const endDate = this.textAttr(fact, "endDate");
        const normalizedEnd = this.normalizeEndDate(endDate, currentDate);
        return {
          fact,
          company: fact.entityName,
          startDate,
          endDate,
          startTime: this.parseDate(startDate)?.getTime() ?? 0,
          endTime: normalizedEnd.getTime(),
          isCurrent: this.isPresent(endDate) || normalizedEnd.getTime() > new Date(currentDate).getTime(),
        };
      })
      .filter((item) => item.startDate || item.endDate);

    if (employments.length === 0) return null;

    employments.sort((a, b) => b.endTime - a.endTime || b.startTime - a.startTime);
    const latest = employments[0];
    const current = new Date(currentDate);
    const durationSinceEnd = latest.isCurrent
      ? "当前仍在任或资料显示至今"
      : this.diffInYearsMonths(new Date(latest.endTime), current);

    return {
      name: "resume.timeline",
      summary: `按工作经历结束时间排序，最近/最后一份工作为 ${latest.company}；结束时间：${latest.endDate || "未注明"}；距今：${durationSinceEnd}。`,
      confidence: Math.max(...employments.map((item) => item.fact.confidence)),
      data: {
        latestCompany: latest.company,
        latestStartDate: latest.startDate,
        latestEndDate: latest.endDate,
        isCurrent: latest.isCurrent,
        durationSinceEnd,
        timeline: employments.map((item) => ({
          company: item.company,
          startDate: item.startDate,
          endDate: item.endDate,
          sourceText: item.fact.sourceText,
        })),
      },
      evidence: employments.map((item) => this.toEvidence(item.fact)),
    };
  }

  private buildGroupedFactSummary(
    name: string,
    title: string,
    facts: StructuredFact[],
  ): RagToolResult | null {
    if (facts.length === 0) return null;

    const groups = new Map<string, StructuredFact[]>();
    for (const fact of facts) {
      const key = fact.entityName || fact.entityType;
      groups.set(key, [...(groups.get(key) || []), fact]);
    }

    const grouped = [...groups.entries()].slice(0, 8).map(([entityName, items]) => ({
      entityName,
      factTypes: [...new Set(items.map((item) => item.entityType))],
      attributes: this.mergeAttributes(items),
      evidenceCount: items.length,
    }));

    return {
      name,
      summary: `${title}：已整理 ${facts.length} 条结构化事实，覆盖 ${grouped.length} 个主体。`,
      confidence: Math.max(...facts.map((fact) => fact.confidence)),
      data: { groups: grouped },
      evidence: facts.slice(0, 12).map((fact) => this.toEvidence(fact)),
    };
  }

  private mergeAttributes(facts: StructuredFact[]) {
    const result: Record<string, unknown> = {};
    for (const fact of facts) {
      for (const [key, value] of Object.entries(fact.attributes || {})) {
        if (value === undefined || value === null || value === "") continue;
        result[key] = value;
      }
    }
    return result;
  }

  private textAttr(fact: StructuredFact, key: string) {
    const value = fact.attributes?.[key];
    return typeof value === "string" || typeof value === "number" ? String(value) : "";
  }

  private normalizeEndDate(value: string, currentDate: string) {
    if (this.isPresent(value)) return new Date(currentDate);
    return this.parseDate(value) || new Date(0);
  }

  private isPresent(value: string) {
    return /^(present|至今|现在|目前)$/i.test(String(value || "").trim());
  }

  private parseDate(value: string): Date | null {
    const text = String(value || "").trim();
    const match = text.match(/((?:19|20)\d{2})(?:[-/.年](\d{1,2}))?(?:[-/.月](\d{1,2}))?/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2] || 12);
    const day = Number(match[3] || 1);
    if (!year || !month || !day) return null;
    return new Date(Date.UTC(year, month - 1, day));
  }

  private diffInYearsMonths(from: Date, to: Date) {
    if (from.getTime() <= 0 || to.getTime() < from.getTime()) return "无法准确计算";
    let months =
      (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
      (to.getUTCMonth() - from.getUTCMonth());
    if (to.getUTCDate() < from.getUTCDate()) months -= 1;
    const years = Math.floor(months / 12);
    const restMonths = months % 12;
    if (years <= 0) return `${Math.max(restMonths, 0)}个月`;
    if (restMonths <= 0) return `${years}年`;
    return `${years}年${restMonths}个月`;
  }

  private toEvidence(fact: StructuredFact): RagToolEvidence {
    return {
      factId: fact.id,
      chunkId: fact.chunkId,
      documentId: fact.documentId,
      documentTitle: fact.documentTitle,
      sourceText: fact.sourceText,
    };
  }
}
