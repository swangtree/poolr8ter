import * as elo from "elo-rating";
import { compareSync } from "bcryptjs";

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const { pathname } = url;
		const { method } = request;

		//GET endpoint
		if (method === "GET" && pathname === "/leaderboard") {
			const dataKey = "data"
			const data = await env.POOL_KV.get(dataKey, "json") as any|| {players: {}};

			const leaderboard = Object.entries(data.players).map(([name, playerData]: [string, any]) => ({
				name,
				elo: playerData.elo
			}))

			.sort((a, b) => b.elo - a.elo);

			return Response.json(leaderboard)
		}

		//POST endpoint
		if (method === "POST" && pathname === "/report") {
			try {
				//JSON body like: { p1: "sam", pw1: "pass", p2: "erin", pw2: "pass", winner: "sam" }
				const body = await request.json<any>();

				if (!body.p1 || !body.pw1 || !body.p2 || !body.pw2 || !body.winner) {
					return new Response("Missing required fields in request body.", {status: 400})
				}

				const dataKey = "data";
				const currentData = await env.POOL_KV.get(dataKey, "json") as any || {players: {}, matches: []};

				const player1 = currentData.players[body.p1];
				const player2 = currentData.players[body.p2];

				if (!player1 || !player2) {
					return new Response('One or both players not found.', { status: 404 });
				}

				const isP1PasswordValid = compareSync(body.pw1, player1.pwd);
				const isP2PasswordValid = compareSync(body.pw2, player2.pwd);

				if (!isP1PasswordValid || !isP2PasswordValid) {
					return new Response("Invalid password.", { status: 401 })
				}

				const rating = new elo.Rating()
				const p1Elo = player1.elo || 1200;
				const p2Elo = player2.elo || 1200;

				const { playerRating, opponentRating } = 
					body.winner === body.p1
						? rating.calculate(p1Elo, p2Elo, 1)
						: rating.calculate(p1Elo, p2Elo, 0);

				currentData.players[body.p1].elo = playerRating
				currentData.players[body.p2].elo = opponentRating

				currentData.matches.push({
					p1: body.p1,
					p2: body.p2,
					winner: body.winner,
					ts: Date.now(),
				})

				await env.POOL_KV.put(dataKey, JSON.stringify(currentData));

				return Response.json({ok: true, message: "Match reported successfully"});
			} catch(error) {
				console.error("Error in /report:", error);
				if (error instanceof SyntaxError) {
					return new Response("Invalid JSON in request body.", {status: 400});
				}
				return new Response("An error occured.", {status: 500})
			}
		}
		return new Response('Not Found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;

export interface Env {
	POOL_KV: KVNamespace;
}