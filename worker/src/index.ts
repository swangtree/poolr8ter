import { createClient } from "@supabase/supabase-js";

interface Env {
	SUPABASE_URL: string;
	SUPABASE_SERVICE_ROLE_KEY: string;
}

interface ReportMatchBody {
	opponent_id: string;
	winner_id: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		console.log(`[worker] Received request: ${request.method} ${request.url}`);

		// CORS preflight handling
		if (request.method === 'OPTIONS') {
			return handleOptions(request);
		}

		const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

		const url = new URL(request.url);
		const { pathname } = url;
		const { method } = request;

		let response;

		//GET endpoint
		if (method === "GET" && pathname === "/leaderboard") {
			try{
				const {data, error} = await supabase
				.from("players_with_win_percentage")
				.select("*")
				.order("elo", {ascending: false});

				if (error) {
					console.error("Supabase error:", error);
					response = new Response("Error fetching leaderboard", {status: 500});
				} else {
					response = Response.json(data);
				}
			}
			catch(e) {
				console.error("Fetch error:", e);
				response = new Response("Error fetching leaderboard", {status: 500});
			}
		}

		//POST endpoint
		else if (method === "POST" && pathname === "/report") {
			try {
				const authHeader = request.headers.get("Authorization");

				if (!authHeader || !(authHeader.startsWith("Bearer"))) {
					response = new Response("Missing or invalid Authorization header", {status: 401});
				} else {
					const token = authHeader.split(" ")[1];
					const { data: {user}, error: userError } = await supabase.auth.getUser(token);

					if (userError || !user) {
						response = new Response("Invalid JWT", {status: 401});
					} else {
						const {opponent_id, winner_id } = await request.json() as ReportMatchBody;

						if (!opponent_id || !winner_id) {
							response = new Response("Missing opponent_id or winner_id in request body", {status: 400});
						} else {
							const {error: rpcError} = await supabase.rpc("report_match", {
								reporting_player_id: user.id,
								opponent_player_id: opponent_id,
								winner_player_id: winner_id,
							});

							if (rpcError) {
								console.log("Supabase RPC error", rpcError);
								response = new Response(JSON.stringify({error: "Failed to report match."}), { status: 500});
							} else {
								response = new Response(JSON.stringify({message: "Match reported successfully!"}), {status: 200});
							}
						}
					}
				}
			} catch (error) {
				console.error("Error processing match report:", error);
				response = new Response(JSON.stringify({error: "An unexpected error occurred"}), {status: 500});
			}
		}

		else if (method === 'GET' && pathname === '/matches') {
			try {
				// 1. Authenticate the user via JWT
				const authHeader = request.headers.get('Authorization');
				if (!authHeader || !authHeader.startsWith('Bearer ')) {
					response = new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), { status: 401 });
				} else {
					const token = authHeader.split(' ')[1];
					const { data: { user }, error: userError } = await supabase.auth.getUser(token);

					if (userError || !user) {
						response = new Response(JSON.stringify({ error: 'Invalid JWT' }), { status: 401 });
					} else {
						// 2. Call the database function you created
						const { data, error: rpcError } = await supabase.rpc('get_match_history', {
							user_id: user.id,
						});

						if (rpcError) {
							console.error('Supabase RPC error:', rpcError);
							response = new Response(JSON.stringify({ error: 'Failed to fetch match history.' }), { status: 500 });
						} else {
							// 3. Process the data to be frontend-friendly
							const processedMatches = data.map((match: any) => {
								const isPlayer1 = match.player1_id === user.id;
								const opponentUsername = isPlayer1 ? match.player2_username : match.player1_username;
								const eloChange = isPlayer1 
									? match.player1_elo_after - match.player1_elo_before 
									: match.player2_elo_after - match.player2_elo_before;

								return {
									id: match.id,
									opponent_username: opponentUsername,
									is_victory: match.winner_id === user.id,
									elo_change: eloChange,
									played_at: new Date(match.played_at).toLocaleDateString('en-US', {
										year: 'numeric',
										month: 'long',
										day: 'numeric',
									}),
								};
							});

							response = new Response(JSON.stringify(processedMatches), {
								headers: { 'Content-Type': 'application/json' },
								status: 200,
							});
						}
					}
				}
			} catch (error) {
				console.error('Error fetching match history:', error);
				response = new Response(JSON.stringify({ error: 'An unexpected error occurred' }), { status: 500 });
			}
		}

		else if (method === 'POST' && pathname === '/username') {
			try {
				// 1. Authenticate the user
				const authHeader = request.headers.get('Authorization');
				if (!authHeader || !authHeader.startsWith('Bearer ')) {
					response = new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), { status: 401 });
				} else {
					const token = authHeader.split(' ')[1];
					const { data: { user }, error: userError } = await supabase.auth.getUser(token);

					if (userError || !user) {
						response = new Response(JSON.stringify({ error: 'Invalid JWT' }), { status: 401 });
					} else {
						// 2. Parse the new username from the body
						const { new_username } = await request.json() as { new_username: string };
						if (!new_username) {
							response = new Response(JSON.stringify({ error: 'Missing new_username in request body' }), { status: 400 });
						} else {
							// 3. Update the player's username in the database
							const { error: updateError } = await supabase
								.from('players')
								.update({ username: new_username })
								.eq('id', user.id);

							if (updateError) {
								console.error('Supabase error updating username:', updateError);
								// Check for a unique constraint violation
								if (updateError.code === '23505') {
									response = new Response(JSON.stringify({ error: 'Username is already taken.' }), { status: 409 }); // 409 Conflict
								} else {
									response = new Response(JSON.stringify({ error: 'Failed to update username.' }), { status: 500 });
								}
							} else {
								response = new Response(JSON.stringify({ message: 'Username updated successfully!' }), { status: 200 });
							}
						}
					}
				}
			} catch (error) {
				console.error('Error updating username:', error);
				response = new Response(JSON.stringify({ error: 'An unexpected error occurred' }), { status: 500 });
			}
		}
		
		else {
			response = new Response('Not Found', { status: 404 });
		}

		// Add CORS headers to all responses
		return new Response(response.body, {
			status: response.status,
			headers: {
				...response.headers,
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type, Authorization',
			}
		});
	},
};

const handleOptions = (request: Request) => {
	const headers = request.headers;
	if (
		headers.get('Origin') !== null &&
		headers.get('Access-Control-Request-Method') !== null &&
		headers.get('Access-Control-Request-Headers') !== null
	) {
		// Handle CORS preflight requests.
		return new Response(null, {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type, Authorization',
			},
		});
	} else {
		// Handle standard OPTIONS request.
		return new Response(null, {
			headers: {
				Allow: 'GET, POST, OPTIONS',
			},
		});
	}
};