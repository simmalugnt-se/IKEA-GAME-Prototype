# Scoreboard Rive Events

This is the current event contract between the game and the Rive scoreboard.

## What Changed

Before:

- Combos were sent as `game_event_triggered` IDs like `"2_combo"`, `"3_combo"`, `"4_combo"`.
- Combos could also trigger bonus events directly.

Now:

- Combos are sent as `combo_triggered` with `triggerComboTriggered`.
- Use `comboMultiplier` instead of `"2_combo"`, `"3_combo"`, `"4_combo"`, etc.
- Combos still give score bonuses.
- `3x` combo and higher send a separate `timebonus` event.
- Gift balloons are the only source of bonus events.

## Quick Rive Wiring Summary

### Combos

- Use `triggerComboTriggered`.
- Read `comboMultiplier` to know if it was `2x`, `3x`, `4x`, etc.
- Do not listen for `"2_combo"`, `"3_combo"`, `"4_combo"`, etc. Those event IDs are no longer sent.

### Time Bonuses

- Use `triggerSpecialEvent`.
- Check `gameEventId === "timebonus"`.
- Read `eventLabel` for the display label, for example `"+1s TIME"` or `"+5s TIME"`.
- Read `gameEventPayloadJson` if you need the raw `awardedMs` value.

### Gift Bonus Events

- Use `triggerSpecialEvent`.
- Check `gameEventId` for which bonus was selected.
- Use `eventBalloonType` for enum-based branching.
- `eventBalloonTrigger` fires every time a gift bonus event is applied, even if the same bonus happens twice in a row.

## How To Log Rive Events

Enable this setting in `src/scoreboard/scoreBoardSettings.ts`:

```ts
debug: {
  showOverlayByDefault: false,
  logRiveEvents: true,
}
```

Set it back to `false` when you are done.

When enabled, the scoreboard shows an on-screen `Rive event log` panel with the latest events. It also writes the same diagnostics to the browser console:

```txt
[scoreboard:rive:apply]
[scoreboard:rive:trigger]
```

The on-screen panel shows the incoming event, `eventLabel`, the main trigger, and key Rive values. It is ordered oldest at the top and newest at the bottom.

`[scoreboard:rive:apply]` in the console shows the incoming scoreboard event, the data written to the Rive ViewModel, and the main trigger that should be fired.

`[scoreboard:rive:trigger]` shows every trigger actually called on the Rive runtime, including `eventBalloonTrigger`.

## Event Sequences

### 2x Combo

Rive receives:

```ts
type = "combo_triggered"
trigger = "triggerComboTriggered"
comboMultiplier = 2
eventLabel = "x2 COMBO"
```

No `timebonus` event is sent for `2x`.

### 3x Combo

Rive receives the combo event:

```ts
type = "combo_triggered"
trigger = "triggerComboTriggered"
comboMultiplier = 3
eventLabel = "x3 COMBO"
```

Then Rive receives the time bonus event:

```ts
type = "game_event_triggered"
trigger = "triggerSpecialEvent"
gameEventId = "timebonus"
eventLabel = "+1s TIME"
```

Payload:

```ts
awardedMs = 1000
reason = "combo"
```

### 4x Combo And Higher

Rive receives the same combo event shape:

```ts
type = "combo_triggered"
trigger = "triggerComboTriggered"
comboMultiplier = 4
eventLabel = "x4 COMBO"
```

Then Rive receives `timebonus`:

```ts
type = "game_event_triggered"
trigger = "triggerSpecialEvent"
gameEventId = "timebonus"
eventLabel = "+2s TIME"
```

Combo time mapping:

```ts
2x = no timebonus event
3x = awardedMs 1000
4x = awardedMs 2000
5x = awardedMs 3000
6x = awardedMs 4000
```

Higher combos keep following the same pattern:

```ts
awardedMs = (comboMultiplier - 2) * 1000
```

### Time Balloon

When a `time_balloon` is hit, Rive receives:

```ts
type = "game_event_triggered"
trigger = "triggerSpecialEvent"
gameEventId = "timebonus"
eventLabel = "+5s TIME"
```

Payload:

```ts
awardedMs = 5000
reason = "spawn_item"
```

### Gift Balloon

`gift_balloon` is the only spawn item that should trigger bonus events.

When a gift balloon is hit, the game chooses one enabled bonus and sends one of these:

```ts
gameEventId = "ground_ball_wave_reward"
gameEventId = "combo_cluster_reward"
gameEventId = "slowmo_reward"
gameEventId = "track_sweeper_reward"
gameEventId = "gravity_loss_reward"
```

All gift bonus events use:

```ts
type = "game_event_triggered"
trigger = "triggerSpecialEvent"
triggerSource = "gift_balloon"
```

Gift bonus events also set `eventBalloonType` and fire `eventBalloonTrigger`.

## Gift Bonus Details

### Ground Ball Wave

```ts
gameEventId = "ground_ball_wave_reward"
actionType = "spawn_ground_ball_wave"
eventBalloonType = "ground_ball_wave_reward"
```

### Combo Cluster

```ts
gameEventId = "combo_cluster_reward"
actionType = "spawn_burst"
eventBalloonType = "combo_cluster_reward"
```

### Slow Motion

```ts
gameEventId = "slowmo_reward"
actionType = "time_scale_boost"
eventBalloonType = "slowmo_reward"
```

### Track Sweeper

```ts
gameEventId = "track_sweeper_reward"
actionType = "spawn_track_sweeper"
eventBalloonType = "track_sweeper_reward"
```

### Gravity Loss

```ts
gameEventId = "gravity_loss_reward"
actionType = "gravity_shift"
eventBalloonType = "gravity_loss_reward"
```

## Useful Rive Values

Combo events provide:

```ts
comboMultiplier
comboStrikeSize
comboChainBonus
comboPerPopPoints
comboTotalPoints
scoreDelta
score
eventLabel
```

Special events provide:

```ts
gameEventId
gameEventPayloadJson
eventLabel
eventBalloonType
```

## Current Special Event IDs

These are the current `game_event_triggered` IDs Rive should branch on:

```ts
"timebonus"
"ground_ball_wave_reward"
"combo_cluster_reward"
"slowmo_reward"
"track_sweeper_reward"
"gravity_loss_reward"
```

These old combo event IDs are no longer sent:

```ts
"2_combo"
"3_combo"
"4_combo"
"5_combo"
"6_combo"
```
