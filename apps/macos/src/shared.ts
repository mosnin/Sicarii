export interface DeviceStartRequest { readonly body: Uint8Array; }
export interface DeviceStart {
  readonly deviceCode: Uint8Array;
  readonly userCode: Uint8Array;
  readonly verificationUrl: Uint8Array;
}
export interface TokenRequest { readonly body: Uint8Array; }
export interface TokenBundle {
  readonly accessToken: Uint8Array;
  readonly refreshToken: Uint8Array;
}
export interface OverviewRequest { readonly body: Uint8Array; }
export interface OverviewData {
  readonly accountName: Uint8Array;
  readonly accountType: Uint8Array;
  readonly companies: number;
  readonly contacts: number;
  readonly enriched: number;
  readonly inConversation: number;
  readonly radarActive: number;
  readonly radarSignals: number;
  readonly replies: number;
  readonly dueFollowups: number;
  readonly toEnrich: number;
  readonly activityOne: Uint8Array;
  readonly activityTwo: Uint8Array;
  readonly activityThree: Uint8Array;
}
