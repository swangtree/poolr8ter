-- This file contains the SQL for creating database functions and views.
-- Copy and paste the content of this file into the Supabase SQL Editor.

-- A view to add a calculated win_percentage to our players table.
create or replace view public.players_with_win_percentage as
select
  id,
  username,
  elo,
  wins,
  losses,
  case
    when (wins + losses) = 0 then 0
    else (wins::float * 100) / (wins + losses)
  end as win_percentage
from
  public.players;

-- Function to report a match, calculate ELO, and update player stats
-- Arguments are ordered alphabetically as required by PostgREST for RPC calls with named parameters.
create or replace function report_match(
  opponent_player_id uuid,
  reporting_player_id uuid,
  winner_player_id uuid
)
returns void as $
declare
  player1_elo_before int;
  player2_elo_before int;
  player1_elo_after int;
  player2_elo_after int;
  k_factor int = 32; -- ELO K-factor
  player1_expected_score float;
  player2_expected_score float;
begin
  -- 1. Get current ELO for both players
  select elo into player1_elo_before from public.players where id = reporting_player_id;
  select elo into player2_elo_before from public.players where id = opponent_player_id;

  -- 2. Calculate expected scores
  player1_expected_score = 1.0 / (1.0 + pow(10, (player2_elo_before - player1_elo_before) / 400.0));
  player2_expected_score = 1.0 / (1.0 + pow(10, (player1_elo_before - player2_elo_before) / 400.0));

  -- 3. Calculate new ELO scores based on the winner
  if winner_player_id = reporting_player_id then
    -- Reporting player (player 1) won
    player1_elo_after = player1_elo_before + k_factor * (1 - player1_expected_score);
    player2_elo_after = player2_elo_before + k_factor * (0 - player2_expected_score);
  else
    -- Opponent (player 2) won
    player1_elo_after = player1_elo_before + k_factor * (0 - player1_expected_score);
    player2_elo_after = player2_elo_before + k_factor * (1 - player2_expected_score);
  end if;

  -- 4. Insert the match record
  insert into public.matches(player1_id, player2_id, winner_id, player1_elo_before, player1_elo_after, player2_elo_before, player2_elo_after)
  values (reporting_player_id, opponent_player_id, winner_player_id, player1_elo_before, player1_elo_after, player2_elo_before, player2_elo_after);

  -- 5. Update player 1's stats
  update public.players
  set
    elo = player1_elo_after,
    wins = wins + (case when reporting_player_id = winner_player_id then 1 else 0 end),
    losses = losses + (case when reporting_player_id <> winner_player_id then 1 else 0 end)
  where id = reporting_player_id;

  -- 6. Update player 2's stats
  update public.players
  set
    elo = player2_elo_after,
    wins = wins + (case when opponent_player_id = winner_player_id then 1 else 0 end),
    losses = losses + (case when opponent_player_id <> winner_player_id then 1 else 0 end)
  where id = opponent_player_id;

end;
$ language plpgsql;
