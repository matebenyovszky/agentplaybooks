import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const runtime = 'edge';

export async function GET() {
    try {
        const headersList = await headers();
        const host = headersList.get("host") || "unknown-host";
        const protocol = headersList.get("x-forwarded-proto") || "unknown-proto";
        const baseUrl = `${protocol}://${host}`;

        const slug = "welcome-to-agentplaybooks";
        const filename = `${slug}.md`;
        const fileUrl = `${baseUrl}/blog/${filename}`;

        // Try fetching
        let fetchResult = "Not attempted";
        let fetchStatus = 0;
        let fetchError = "";

        try {
            console.log(`Debug fetching: ${fileUrl}`);
            const res = await fetch(fileUrl);
            fetchStatus = res.status;
            fetchResult = res.ok ? "Success (OK)" : `Failed (${res.status} ${res.statusText})`;
        } catch (e: any) {
            fetchResult = "Error thrown";
            fetchError = e.message;
        }

        return NextResponse.json({
            debug: true,
            environment: {
                host,
                protocol,
                baseUrl,
                isNode: typeof process !== 'undefined' && !!process.versions?.node,
            },
            fetchTest: {
                targetUrl: fileUrl,
                status: fetchStatus,
                result: fetchResult,
                error: fetchError
            },
            headers: Object.fromEntries(headersList.entries())
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// Helper to handle the baseUrl var which isn't defined above but logic is same as page
const props_baseUrl = ""; 
