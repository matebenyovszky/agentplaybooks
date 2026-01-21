import { NextResponse } from "next/server";
import { headers } from "next/headers";



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
        } catch (e) {
            fetchResult = "Error thrown";
            if (e instanceof Error) {
                fetchError = e.message;
            } else {
                fetchError = String(e);
            }
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
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: message }, { status: 500 });
    }
} 
