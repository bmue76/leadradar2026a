export type CreditType = "LICENSE_30D" | "LICENSE_365D" | "DEVICE_SLOT";

export type ConsumeAction = "ACTIVATE_LICENSE_30D" | "ACTIVATE_LICENSE_365D" | "ADD_DEVICE_SLOT";

export type BillingEntitlement = {
  validUntil: string | null;
  isActive: boolean;
  maxDevices: number;
  activeDevices: number;
};

export type BillingCreditBalance = {
  type: CreditType;
  quantity: number;
  expiresAt: string;
};

export type BillingOverview = {
  entitlement: BillingEntitlement;
  credits: BillingCreditBalance[];
  expiringSoon?: { count: number };
};
