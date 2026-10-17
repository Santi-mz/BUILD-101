import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createClient } from "@supabase/supabase-js";
import { createRumboMcp } from "@/lib/mcp/server";

// Endpoint MCP público (stateless): expone search_pubmed y search_news a cualquier cliente MCP
// (Claude Code, Claude Desktop, Cursor...). Las herramientas de perfil solo viven dentro del chat logueado.
async function handle(req: Request) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const server = createRumboMcp({ supabase });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
