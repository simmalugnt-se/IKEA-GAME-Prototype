# In-Game Bonus Events For Rive

All in-game bonus events are sent to Rive as:

```ts
type: "game_event_triggered"
```

They all fire this Rive trigger:

```ts
triggerSpecialEvent
```

The useful Rive value is:

```ts
gameEventId
```

## Combo Events

When a combo happens, Rive gets a readable combo event:

```ts
gameEventId = "4_combo"
```

Examples:

```ts
"2_combo"
"3_combo"
"4_combo"
"5_combo"
"6_combo"
```

Higher combos keep following the same pattern.

## Combo Bonus Example

If a 4 combo triggers gravity loss, Rive receives:

```ts
gameEventId = "4_combo"
```

and:

```ts
gameEventId = "gravity_loss_reward"
```

The bonus payload also includes:

```ts
triggerSource = "combo"
comboMultiplier = 4
```

## Gift Balloon Bonus Events

When a `gift_balloon` is hit, it chooses one enabled bonus. Rive receives only that selected bonus event.

### Ground Ball Wave

```ts
gameEventId = "ground_ball_wave_reward"
```

Payload:

```ts
triggerSource = "gift_balloon"
actionType = "spawn_ground_ball_wave"
```

### Slow Motion

```ts
gameEventId = "slowmo_reward"
```

Payload:

```ts
triggerSource = "gift_balloon"
actionType = "time_scale_boost"
```

### Track Sweeper

```ts
gameEventId = "track_sweeper_reward"
```

Payload:

```ts
triggerSource = "gift_balloon"
actionType = "spawn_track_sweeper"
```

### Gravity Loss

```ts
gameEventId = "gravity_loss_reward"
```

Payload:

```ts
triggerSource = "gift_balloon"
actionType = "gravity_shift"
```

## Current Bonus IDs

These are the current in-game bonus IDs Rive can branch on:

```ts
"2_combo"
"3_combo"
"4_combo"
"5_combo"
"ground_ball_wave_reward"
"slowmo_reward"
"track_sweeper_reward"
"gravity_loss_reward"
"combo_cluster_reward"
"timebonus"
```

Higher combo IDs are generated automatically, such as:

```ts
"6_combo"
"7_combo"
"8_combo"
```
