import { createClient } from "@supabase/supabase-js";

interface Env {
	SUPABASE_URL: string;
	SUPABASE_SERVICE_ROLE_KEY: string;
}

const allowedOrigins = [
	'https://swangtree.github.io',
	'http://localhost:8787'
];

interface ReportMatchBody {
	opponent_id: string;
	winner_id: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const origin = request.headers.get('Origin') || '';
		const normalizedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
		
		const corsHeaders = {
			'Access-Control-Allow-Origin': allowedOrigins.includes(normalizedOrigin) ? normalizedOrigin : allowedOrigins[0],
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		};

		if (request.method === 'OPTIONS') {
			return handleOptions(request, corsHeaders);
		}

		const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
		const url = new URL(request.url);
		const { pathname } = url;
		const { method } = request;

		try {
			if (method === "GET" && pathname === "/leaderboard") {
				const { data, error } = await supabase
					.from("players_with_win_percentage")
					.select("*")
					.order("elo", { ascending: false });

				if (error) throw error;
				return Response.json(data, { headers: corsHeaders });

			} else if (method === "POST" && pathname === "/report") {
				const authHeader = request.headers.get("Authorization");
				if (!authHeader || !authHeader.startsWith("Bearer ")) {
					return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), { status: 401, headers: corsHeaders });
				}
				const token = authHeader.split(" ")[1];
				const { data: { user }, error: userError } = await supabase.auth.getUser(token);

				if (userError || !user) {
					return new Response(JSON.stringify({ error: "Invalid JWT" }), { status: 401, headers: corsHeaders });
				}

				const { opponent_id, winner_id } = await request.json() as ReportMatchBody;
				if (!opponent_id || !winner_id) {
					return new Response(JSON.stringify({ error: "Missing opponent_id or winner_id" }), { status: 400, headers: corsHeaders });
				}

				const { error: rpcError } = await supabase.rpc("report_match", {
					reporting_player_id: user.id,
					opponent_player_id: opponent_id,
					winner_player_id: winner_id,
				});

				if (rpcError) throw rpcError;
				return new Response(JSON.stringify({ message: "Match reported successfully!" }), { status: 200, headers: corsHeaders });

			} else if (method === 'GET' && pathname === '/matches') {
				const authHeader = request.headers.get('Authorization');
				if (!authHeader || !authHeader.startsWith('Bearer ')) {
					return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), { status: 401, headers: corsHeaders });
				}
				const token = authHeader.split(' ')[1];
				const { data: { user }, error: userError } = await supabase.auth.getUser(token);

				if (userError || !user) {
					return new Response(JSON.stringify({ error: 'Invalid JWT' }), { status: 401, headers: corsHeaders });
				}

				const { data, error: rpcError } = await supabase.rpc('get_match_history', { user_id: user.id });
				if (rpcError) throw rpcError;

				const processedMatches = data.map((match: any) => ({
					id: match.id,
					opponent_username: match.player1_id === user.id ? match.player2_username : match.player1_username,
					is_victory: match.winner_id === user.id,
					elo_change: match.player1_id === user.id ? match.player1_elo_after - match.player1_elo_before : match.player2_elo_after - match.player2_elo_before,
					played_at: new Date(match.played_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
				}));

				return Response.json(processedMatches, { headers: corsHeaders });

			} else if (method === 'POST' && pathname === '/username') {
				const authHeader = request.headers.get('Authorization');
				if (!authHeader || !authHeader.startsWith('Bearer ')) {
					return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), { status: 401, headers: corsHeaders });
				}
				const token = authHeader.split(' ')[1];
				const { data: { user }, error: userError } = await supabase.auth.getUser(token);

				if (userError || !user) {
					return new Response(JSON.stringify({ error: 'Invalid JWT' }), { status: 401, headers: corsHeaders });
				}

				const { new_username } = await request.json() as { new_username: string };
				if (!new_username) {
					return new Response(JSON.stringify({ error: 'Missing new_username in request body' }), { status: 400, headers: corsHeaders });
				}

				const { error: updateError } = await supabase.from('players').update({ username: new_username }).eq('id', user.id);
				if (updateError) {
					if (updateError.code === '23505') {
						return new Response(JSON.stringify({ error: 'Username is already taken.' }), { status: 409, headers: corsHeaders });
					}
					throw updateError;
				}
				return new Response(JSON.stringify({ message: 'Username updated successfully!' }), { status: 200, headers: corsHeaders });

			} else {
				return new Response('Not Found', { status: 404, headers: corsHeaders });
			}

		} catch (e: any) {
			console.error("Worker error:", e);
			const errorMessage = e.message || "An internal error occurred";
			const errorStatus = e.code === '23505' ? 409 : 500;
			return new Response(JSON.stringify({ error: errorMessage }), { status: errorStatus, headers: corsHeaders });
		}
	},
};

const handleOptions = (request: Request, corsHeaders: Record<string, string>) => {
	const reqHeaders = request.headers;
	if (
		reqHeaders.get('Origin') !== null &&
		reqHeaders.get('Access-Control-Request-Method') !== null &&
		reqHeaders.get('Access-Control-Request-Headers') !== null
	) {
		return new Response(null, { headers: corsHeaders });
	} else {
		return new Response(null, {
			headers: {
				Allow: 'GET, POST, OPTIONS',
			},
		});
	}
};