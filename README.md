# IKEA Game Prototype

Frontend-only React + Three.js game prototype built with Vite, React Three Fiber, and Rapier physics.

## Development

- `npm run dev`
- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm run preview`

The main game runs at `http://localhost:5173`.

## Project Docs

- High-level project documentation: [DOCS.md](/home/simmalugnt/dev/IKEA-GAME-Prototype/DOCS.md)
- Core gameplay tuning: [src/settings/GameSettings.ts](/home/simmalugnt/dev/IKEA-GAME-Prototype/src/settings/GameSettings.ts)
- Shared settings/types: [src/settings/GameSettings.types.ts](/home/simmalugnt/dev/IKEA-GAME-Prototype/src/settings/GameSettings.types.ts)

## Bonus Items And Events

The current bonus/power-up system is split into two parts:

- `itemDefinitions`: defines spawnable item types such as normal balloons, hazards, and cluster balloons
- `eventRules`: defines when special events trigger and what they do

You configure both in [src/settings/GameSettings.ts](/home/simmalugnt/dev/IKEA-GAME-Prototype/src/settings/GameSettings.ts#L350).

### `itemDefinitions`

Each item definition describes a spawnable gameplay item:

- `enabled`: lets you turn the item on or off quickly
- `includeInDefaultPool`: whether it participates in normal spawning
- `weight`: weighted chance inside the default spawn pool
- `weightAcceleration`: optional time-based scaling of that weight during the run
- `weightAccelerationCurve`: curve used for the weight scaling
- `weightMaxMultiplier`: optional cap for how much the weight can grow
- `maxConcurrent`: optional cap for that item type
- `maxConcurrentAcceleration`: optional time-based scaling of the concurrency cap
- `maxConcurrentAccelerationCurve`: curve used for concurrency scaling
- `maxConcurrentCap`: optional hard cap for the scaled concurrency
- `canTriggerSpawnEvents`: whether pops from this item can qualify new combo reward events
- `color`: material color index
- `randomizeColor`: whether the color is randomized
- `randomizeDropType`: whether payload type is randomized
- `dropType`: only needed when `randomizeDropType` is `false`
- `scoreMode`: whether the hit goes through combo scoring or a direct effect
- `scoreDelta` / `timeDeltaMs`: direct hit effects
- `feedbackText`: optional big text feedback

### `eventRules`

Each event rule is structured as:

- `enabled`
- `trigger`
- `action`

Current trigger/action types:

- `trigger.type: "combo_multiplier"`
- `trigger.type: "pop_streak_without_miss"`
- `action.type: "spawn_burst"`
- `action.type: "cursor_size_boost"`
- `action.type: "cursor_burst_ring"`
- `action.type: "spawn_ground_ball_wave"`
- `action.type: "spawn_track_sweeper"`

This means you can test combinations by enabling/disabling specific rules without changing runtime code.

When `spawner.eventSelectionMode` is set to `one_random`, each qualifying combo picks one eligible reward immediately. When it is `all`, every eligible reward triggers, and the queue settings can be used to serialize them.

For combo triggers, `minMultiplier` and optional `maxMultiplier` let you target exact bands such as:
- `3x only`: `minMultiplier: 3`, `maxMultiplier: 3`
- `4x and up`: `minMultiplier: 4`

For non-combo pacing, `pop_streak_without_miss` triggers when the player reaches a configured number of pops without any balloon leaving the play area. The streak resets on a missed balloon, so it works well for precision-based rewards such as a cursor buff.

### Current Built-In Events

- `combo_cluster_reward`: spawns a bouquet cluster of bonus balloons
- `big_cursor_reward`: temporarily enlarges the cursor and hit radius with animated ease-in/ease-out
- `cursor_burst_reward`: adds rotating cursor satellites that can pop balloons around the main cursor
- `ground_ball_wave_reward`: spawns rolling contagion balls from screen edges that recolor and score through physics collisions
- `track_sweeper_reward`: sends a large roller across the track using a cylinder primitive and scene physics

## Runtime Pieces

These files are the important ones for the bonus/event system:

- [src/gameplay/spawnItemSettings.ts](/home/simmalugnt/dev/IKEA-GAME-Prototype/src/gameplay/spawnItemSettings.ts): item lookup, weighted selection, burst layouts
- [src/gameplay/ItemSpawner.tsx](/home/simmalugnt/dev/IKEA-GAME-Prototype/src/gameplay/ItemSpawner.tsx): normal spawn loop and spawned item integration
- [src/gameplay/gameplayStore.ts](/home/simmalugnt/dev/IKEA-GAME-Prototype/src/gameplay/gameplayStore.ts): combo resolution, event triggering, temporary cursor boost runtime
- [src/gameplay/GroundBallWaveRuntime.tsx](/home/simmalugnt/dev/IKEA-GAME-Prototype/src/gameplay/GroundBallWaveRuntime.tsx): rolling ground-ball scene event runtime
- [src/geometry/BalloonGroup.tsx](/home/simmalugnt/dev/IKEA-GAME-Prototype/src/geometry/BalloonGroup.tsx): balloon visuals, payload spawning, hazard marker

## Tuning Notes

- `spawner.maxItems` controls the normal baseline density for default-pool items
- `spawner.maxItemsCap` is the absolute ceiling for all active spawned items
- `gameplay.run.popStreakTimeBonusEveryPops` and `gameplay.run.popStreakTimeBonusMs` let you award extra time for clean no-miss pop streaks without tying it to combo multipliers
- `itemDefinitions[].weightAcceleration` lets specific spawn items, such as hazards, become more common later in the run without changing the whole pool equally
- `itemDefinitions[].maxConcurrentAcceleration` lets hazards or other items raise their simultaneous on-screen cap later in the run
- `spawner.eventSelectionMode: "one_random"` is useful when you want one instant reward per combo instead of stacking every eligible reward
- `spawner.eventQueueGapMs` and `spawner.eventQueueMaxLength` only matter when `eventSelectionMode` is `all` and queueing is enabled
- event cooldowns are tracked per rule, so different power-ups can trigger off the same combo if both qualify
- `combo multiplier` is based on strike size plus chain bonus, not total combos over the whole run

If you add new events, prefer extending `eventRules` with a new `action.type` instead of hardcoding behavior into unrelated gameplay code.
