import {
  managementResourceMetadataResponse,
  oauthMetadataOptionsResponse,
} from "@/app/api/_shared/oauth-resource-metadata";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return managementResourceMetadataResponse(request);
}

export async function OPTIONS() {
  return oauthMetadataOptionsResponse();
}
