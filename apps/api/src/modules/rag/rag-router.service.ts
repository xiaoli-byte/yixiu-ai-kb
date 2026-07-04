import { Injectable } from "@nestjs/common";
import { RagProfileService } from "./rag-profile.service";
import type { RagDomain, RagIntent, RagRoute } from "./rag.types";

@Injectable()
export class RagRouterService {
  private readonly TIMELINE_PATTERN =
    /(最后一份工作|最近一份工作|当前工作|目前工作|现任|最后一家公司|最近一家公司|上一份工作|距今|距离现在|离现在|多久以前|多长时间)/;
  private readonly CALCULATION_PATTERN =
    /(多少|几天|几个月|几年|合计|总计|平均|比例|增长|下降|相差|距今|逾期天数|账龄|利息|罚息)/;
  private readonly COMPARISON_PATTERN = /(对比|比较|区别|差异|哪个更|优劣|适合|推荐哪|参数差异)/;
  private readonly SUMMARY_PATTERN = /(总结|概括|归纳|提炼|摘要|主要内容|核心观点)/;
  private readonly COMPLIANCE_PATTERN = /(合规|风险|禁忌|违法|投诉|威胁|骚扰|诊断|处方|急症|副作用)/;
  private readonly CRM_ACTION_PATTERN = /(跟进|回访|商机|线索|工单|客户状态|销售阶段|下一步)/;
  private readonly KTV_OFFER_PATTERN = /(包厢|房型|套餐|预订|低消|营业时间|酒水|会员价)/;
  private readonly TRADE_TERM_PATTERN = /(FOB|CIF|EXW|DDP|付款方式|交期|报关|认证|HS编码|报价)/i;

  constructor(private readonly profiles: RagProfileService) {}

  route(opts: { question: string; retrievalQuery: string; historyText?: string }): RagRoute {
    const question = this.compact(opts.question);
    const retrievalQuery = this.buildRetrievalQuery(question, opts.retrievalQuery);
    const domain = this.detectDomain(`${question}\n${retrievalQuery}\n${opts.historyText || ""}`);
    const intent = this.detectIntent(question, domain);
    const profile = this.profiles.get(domain);
    const requiresFacts = this.requiresFacts(domain, intent);
    const requiresTool = this.requiresTool(domain, intent);
    const warnings = profile.riskLevel === "high" ? profile.answerPolicy : [];

    return {
      originalQuestion: question,
      retrievalQuery: this.appendBoostTerms(retrievalQuery, domain, intent),
      domain,
      intent,
      profile,
      requiresFacts,
      requiresTool,
      warnings,
    };
  }

  private detectDomain(text: string): RagDomain {
    const normalized = this.compact(text);
    const explicit = this.profiles.classifyText(normalized);
    if (explicit !== "default") return explicit;

    if (this.TIMELINE_PATTERN.test(normalized) && /(工作|公司|任职|经历|简历)/.test(normalized)) {
      return "resume";
    }
    return "default";
  }

  private detectIntent(question: string, domain: RagDomain): RagIntent {
    if (this.TIMELINE_PATTERN.test(question)) return "timeline";
    if (domain === "crm" && this.CRM_ACTION_PATTERN.test(question)) return "factual";
    if (domain === "ktv" && this.KTV_OFFER_PATTERN.test(question)) return "comparison";
    if (domain === "foreign_trade" && this.TRADE_TERM_PATTERN.test(question)) return "factual";
    if (this.COMPLIANCE_PATTERN.test(question) || domain === "medical" || domain === "collection") {
      return "compliance_risk";
    }
    if (this.COMPARISON_PATTERN.test(question)) return "comparison";
    if (this.CALCULATION_PATTERN.test(question)) return "calculation";
    if (this.SUMMARY_PATTERN.test(question)) return "summary";
    if (question.length <= 12 || /^(什么|为什么|怎么|如何|是否|能否|可以)/.test(question)) {
      return "open_qa";
    }
    return "factual";
  }

  private requiresFacts(domain: RagDomain, intent: RagIntent) {
    return (
      domain !== "default" ||
      intent === "timeline" ||
      intent === "calculation" ||
      intent === "comparison" ||
      intent === "compliance_risk"
    );
  }

  private requiresTool(domain: RagDomain, intent: RagIntent) {
    if (domain === "resume" && intent === "timeline") return true;
    if (domain === "ecommerce" && intent === "comparison") return true;
    if (domain === "ktv" && (intent === "comparison" || intent === "factual")) return true;
    if (domain === "foreign_trade" && (intent === "factual" || intent === "comparison")) return true;
    if (domain === "crm" && (intent === "factual" || intent === "summary")) return true;
    if (domain === "collection" && (intent === "calculation" || intent === "compliance_risk")) return true;
    return false;
  }

  private buildRetrievalQuery(question: string, retrievalQuery: string) {
    const query = this.compact(retrievalQuery || question);
    return query || question;
  }

  private appendBoostTerms(query: string, domain: RagDomain, intent: RagIntent) {
    const profile = this.profiles.get(domain);
    const boosts = [...profile.retrievalBoostTerms];
    if (intent === "timeline") {
      boosts.push("起止日期", "开始时间", "结束时间", "至今");
    }
    return this.compact([query, ...boosts].join(" "), 700);
  }

  private compact(text: string, maxLength?: number) {
    const compact = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return maxLength && compact.length > maxLength ? compact.slice(0, maxLength) : compact;
  }
}
