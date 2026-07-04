import { Injectable } from "@nestjs/common";
import type { DomainProfile, RagDomain } from "./rag.types";

const DOMAIN_PROFILES: Record<RagDomain, DomainProfile> = {
  default: {
    domain: "default",
    displayName: "通用知识库",
    riskLevel: "low",
    retrievalBoostTerms: ["资料", "原文", "说明", "结论", "依据"],
    factEntityTypes: ["document_signal"],
    tools: [],
    answerPolicy: [
      "严格基于参考资料回答，资料不足时先说明不足。",
      "可以给出通用建议，但必须和资料事实分开表述。",
    ],
  },
  resume: {
    domain: "resume",
    displayName: "简历/招聘",
    riskLevel: "medium",
    retrievalBoostTerms: [
      "简历",
      "工作经历",
      "任职经历",
      "项目经历",
      "公司",
      "起止时间",
      "时间线",
      "至今",
    ],
    factEntityTypes: ["employment"],
    tools: ["resume.timeline"],
    answerPolicy: [
      "涉及最后、最近、当前、距今等问题时，必须依据起止日期排序和计算。",
      "不要把历史对话中的公司名当成事实，除非用户本轮明确指代。",
    ],
  },
  ecommerce: {
    domain: "ecommerce",
    displayName: "电商商品",
    riskLevel: "medium",
    retrievalBoostTerms: [
      "商品",
      "SKU",
      "SPU",
      "型号",
      "规格",
      "价格",
      "品牌",
      "参数",
      "适配",
      "库存",
      "售后",
    ],
    factEntityTypes: [
      "product",
      "sku",
      "product_attribute",
      "price",
      "inventory",
      "promotion",
      "after_sales_policy",
    ],
    tools: ["ecommerce.compare"],
    answerPolicy: [
      "商品参数、价格、库存、适配性必须以资料或结构化事实为准。",
      "无法确认实时价格或库存时，需要明确提示可能变化。",
    ],
  },
  ktv: {
    domain: "ktv",
    displayName: "KTV/门店服务",
    riskLevel: "medium",
    retrievalBoostTerms: [
      "KTV",
      "包厢",
      "房型",
      "套餐",
      "酒水",
      "预订",
      "营业时间",
      "低消",
      "会员",
      "门店",
    ],
    factEntityTypes: [
      "venue",
      "room_type",
      "package",
      "price",
      "reservation_policy",
      "booking_rule",
      "business_hours",
      "service_rule",
    ],
    tools: ["ktv.offer_summary"],
    answerPolicy: [
      "房型、套餐、价格、低消、营业时间和预订规则必须以资料为准。",
      "无法确认实时余房或最新活动时，需要提示用户以门店确认为准。",
    ],
  },
  foreign_trade: {
    domain: "foreign_trade",
    displayName: "外贸/跨境业务",
    riskLevel: "medium",
    retrievalBoostTerms: [
      "外贸",
      "跨境",
      "询盘",
      "报价",
      "FOB",
      "CIF",
      "EXW",
      "付款方式",
      "交期",
      "报关",
      "认证",
      "HS编码",
    ],
    factEntityTypes: [
      "trade_product",
      "quotation",
      "incoterm",
      "payment_term",
      "shipping_term",
      "shipping_rule",
      "customs_requirement",
      "certification",
      "customer_requirement",
    ],
    tools: ["foreign_trade.terms_summary"],
    answerPolicy: [
      "报价、贸易术语、付款方式、交期、认证和报关要求必须区分资料事实与建议。",
      "涉及法律、税务、海关政策时需要提示以当地最新法规和专业意见为准。",
    ],
  },
  crm: {
    domain: "crm",
    displayName: "CRM/客户管理",
    riskLevel: "medium",
    retrievalBoostTerms: [
      "CRM",
      "客户",
      "联系人",
      "商机",
      "销售阶段",
      "跟进",
      "工单",
      "合同",
      "回访",
      "线索",
    ],
    factEntityTypes: [
      "customer",
      "contact",
      "lead",
      "opportunity",
      "deal_stage",
      "follow_up",
      "ticket",
      "contract",
      "interaction",
      "risk",
    ],
    tools: ["crm.customer_context"],
    answerPolicy: [
      "客户、联系人、商机阶段、跟进记录和工单状态必须以资料或结构化事实为准。",
      "涉及客户隐私、联系方式和合同信息时，回答应最小化披露并避免无依据推断。",
    ],
  },
  medical: {
    domain: "medical",
    displayName: "医疗健康",
    riskLevel: "high",
    retrievalBoostTerms: ["症状", "疾病", "诊断", "治疗", "药物", "剂量", "禁忌", "检查", "医院"],
    factEntityTypes: ["medical_statement"],
    tools: [],
    answerPolicy: [
      "不能替代医生诊断或处方，不能给出确定性诊断。",
      "涉及用药、急症、禁忌、检查结果时，必须提示就医或咨询专业医生。",
      "资料不足时宁可保守，不要补全关键医学事实。",
    ],
  },
  collection: {
    domain: "collection",
    displayName: "催收/账款",
    riskLevel: "high",
    retrievalBoostTerms: ["催收", "逾期", "账单", "欠款", "应还", "还款", "本金", "利息", "罚息", "合规"],
    factEntityTypes: ["collection_account"],
    tools: ["collection.days_overdue"],
    answerPolicy: [
      "金额、账期、逾期天数和承诺还款时间必须依据资料或工具计算。",
      "话术和建议必须保持合规，不得包含威胁、骚扰或误导性内容。",
    ],
  },
};

@Injectable()
export class RagProfileService {
  get(domain: RagDomain): DomainProfile {
    return DOMAIN_PROFILES[domain] ?? DOMAIN_PROFILES.default;
  }

  list(): DomainProfile[] {
    return Object.values(DOMAIN_PROFILES);
  }

  classifyText(text: string): RagDomain {
    const compact = text.replace(/\s+/g, "");
    if (this.hasAny(compact, ["简历", "工作经历", "任职经历", "项目经历", "教育经历", "求职"])) {
      return "resume";
    }
    if (
      this.hasAny(compact, [
        "SKU",
        "SPU",
        "商品",
        "型号",
        "规格",
        "库存",
        "下单",
        "退换货",
        "美妆",
        "服饰",
        "家电",
        "数码",
      ])
    ) {
      return "ecommerce";
    }
    if (this.hasAny(compact, ["KTV", "ktv", "包厢", "房型", "套餐", "酒水", "低消", "欢唱", "门店预订"])) {
      return "ktv";
    }
    if (this.hasAny(compact, ["外贸", "跨境", "询盘", "报价", "FOB", "CIF", "EXW", "付款方式", "交期", "报关", "HS编码"])) {
      return "foreign_trade";
    }
    if (this.hasAny(compact, ["CRM", "crm", "客户管理", "联系人", "商机", "销售阶段", "跟进记录", "工单", "线索"])) {
      return "crm";
    }
    if (this.hasAny(compact, ["症状", "疾病", "诊断", "治疗", "药物", "剂量", "禁忌", "检查结果", "病历"])) {
      return "medical";
    }
    if (this.hasAny(compact, ["催收", "逾期", "欠款", "应还", "还款日", "账单", "罚息", "本金"])) {
      return "collection";
    }
    return "default";
  }

  private hasAny(text: string, terms: string[]) {
    return terms.some((term) => text.includes(term));
  }
}
