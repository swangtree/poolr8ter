import { createClient } from "@supabase/supabase-js";

interface Env {
	SUPABASE_URL: string;
	SUPABASE_SERVICE_ROLE_KEY: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

		const url = new URL(request.url);
		const { pathname } = url;
		const { method } = request;

		//GET endpoint
		if (method === "GET" && pathname === "/leaderboard") {
			try{
				const {data, error} = await supabase.
				from("players").
				select("username, elo").
				order("elo", {ascending: false});

				if (error) {
					console.error("Supabase error:", error);
					return new Response("Error fetching leaderboard", {status: 500});
				}
				return Response.json(data);
			}
			catch(e) {
				console.error("Fetch error:", e);
				return new Response("Error fetching leaderboard", {status: 500});
			}
		}

		//POST endpoint
		
		return new Response('Not Found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;