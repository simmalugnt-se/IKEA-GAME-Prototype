import { useEntityStore } from "@/entities/entityStore";
import { getGameRunClockSeconds, isGameRunClockRunning } from "@/game/GameRunClock";
import { useGameplayStore } from "@/gameplay/gameplayStore";
import {
  pickWeightedSpawnItemDefinition,
  resolveSpawnItemDefinitionById,
} from "@/gameplay/spawnItemSettings";
import {
  useSpawnerStore,
  type SpawnedItemDescriptor,
} from "@/gameplay/spawnerStore";
import type { SpawnItemHitCallbackEvent } from "@/geometry/BalloonGroup";
import type { PositionTargetHandle } from "@/scene/PositionTargetHandle";
import { SETTINGS } from "@/settings/GameSettings";
import { resolveAccelerationMultiplier } from "@/utils/accelerationCurve";
import { useFrame } from "@react-three/fiber";
import {
  Children,
  cloneElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";

const SPAWN_HEIGHT = 1.3;
const GAME_OVER_AUTO_POP_STAGGER_MS = 60;

type ZGetter = () => number | undefined;

function pickSpawnItemTriggerEventRuleId(item: SpawnedItemDescriptor): string | null {
  const ruleIds = item.spawnItem.triggerEventRuleIds
    ?.map((ruleId) => ruleId.trim())
    .filter((ruleId) => ruleId.length > 0);
  if (ruleIds && ruleIds.length > 0) {
    return ruleIds[Math.floor(Math.random() * ruleIds.length)] ?? null;
  }

  const ruleId = item.spawnItem.triggerEventRuleId?.trim();
  return ruleId && ruleId.length > 0 ? ruleId : null;
}

function countDefaultPoolItems(items: SpawnedItemDescriptor[]): number {
  let count = 0;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item?.spawnItem.includeInDefaultPool === true) {
      count += 1;
    }
  }
  return count;
}

function countItemsByItemId(items: SpawnedItemDescriptor[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (let i = 0; i < items.length; i += 1) {
    const itemId = items[i]?.itemId;
    if (!itemId) continue;
    counts[itemId] = (counts[itemId] ?? 0) + 1;
  }
  return counts;
}

function SpawnedItemView({
  item,
  templates,
  onRegisterCullZ,
  onCleanupRequested,
  autoPopSignal,
  autoPopStaggerMs,
}: {
  item: SpawnedItemDescriptor;
  templates: ReactElement[];
  onRegisterCullZ: (getter: ZGetter) => () => void;
  onCleanupRequested: () => void;
  autoPopSignal: number;
  autoPopStaggerMs: number;
}) {
  if (templates.length === 0) return null;
  const template = templates[item.templateIndex % templates.length];
  const handleSpawnItemHit = (event: SpawnItemHitCallbackEvent) => {
    const gameplayState = useGameplayStore.getState();
    if (item.spawnItem.scoreMode === "direct") {
      const triggerEventRuleId = pickSpawnItemTriggerEventRuleId(item);
      if (triggerEventRuleId) {
        gameplayState.triggerSpawnEventRuleById(triggerEventRuleId, {
          x: event.x,
          y: event.y,
        });
      }
      gameplayState.applySpawnItemHitEffect({
        scoreDelta: item.spawnItem.scoreDelta,
        timeDeltaMs: item.spawnItem.timeDeltaMs,
        x: event.x,
        y: event.y,
        feedbackText: item.spawnItem.feedbackText,
      });
      return;
    }

    gameplayState.registerBalloonPopForCombo({
      x: event.x,
      y: event.y,
      timeMs: event.timeMs,
      canTriggerSpawnEvents: item.spawnItem.canTriggerSpawnEvents !== false,
    });
  };

  return cloneElement(template as ReactElement<Record<string, unknown>>, {
    position: item.position,
    color: item.spawnItem.color,
    randomizeColor: item.spawnItem.randomizeColor,
    randomizeDropType: item.spawnItem.randomizeDropType,
    dropType: item.spawnItem.dropType,
    lifeLossEnabled: item.spawnItem.lifeLossEnabled,
    onSpawnItemHit: handleSpawnItemHit,
    itemMarker: item.spawnItem.itemMarker ?? "none",
    onRegisterCullZ,
    onCleanupRequested,
    autoPopSignal,
    autoPopStaggerMs,
  });
}

type ItemSpawnerProps = {
  spawnMarkerRef: RefObject<PositionTargetHandle | null>;
  cullMarkerRef: RefObject<PositionTargetHandle | null>;
  children: ReactNode;
};

export function ItemSpawner({
  spawnMarkerRef,
  cullMarkerRef,
  children,
}: ItemSpawnerProps) {
  const flowState = useGameplayStore((state) => state.flowState);
  const spawnTimerRef = useRef(0);
  const spawnIdRef = useRef(0);
  const cullGettersRef = useRef<Map<string, ZGetter>>(new Map());
  const previousFlowStateRef = useRef(flowState);
  const autoPopSignalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoPopSignal, setAutoPopSignal] = useState(0);

  const templates = useMemo(() => {
    return Children.toArray(children).filter(
      (child): child is ReactElement =>
        typeof child === "object" && child !== null && "type" in child,
    );
  }, [children]);

  const items = useSpawnerStore((state) => state.items);
  const addItem = useSpawnerStore((state) => state.addItem);
  const consumeQueuedSpawns = useSpawnerStore((state) => state.consumeQueuedSpawns);
  const registerEntity = useEntityStore((state) => state.register);

  useEffect(() => {
    if (flowState === "run") return;
    spawnTimerRef.current = 0;
  }, [flowState]);

  useEffect(() => {
    const wasGameOverTravel = previousFlowStateRef.current === "game_over_travel";
    const enteringGameOverTravel = flowState === "game_over_travel" && !wasGameOverTravel;
    previousFlowStateRef.current = flowState;

    if (!enteringGameOverTravel) {
      return;
    }

    autoPopSignalTimerRef.current = setTimeout(() => {
      autoPopSignalTimerRef.current = null;
      setAutoPopSignal((signal) => signal + 1);
    }, 0);

    return () => {
      if (autoPopSignalTimerRef.current !== null) {
        clearTimeout(autoPopSignalTimerRef.current);
        autoPopSignalTimerRef.current = null;
      }
    };
  }, [flowState]);

  const removeSpawnedItem = useCallback((id: string) => {
    cullGettersRef.current.delete(id);
    useEntityStore.getState().unregister(id);
    useSpawnerStore.getState().removeItem(id);
  }, []);

  useFrame((_state, delta) => {
    // ── Spawn ─────────────────────────────────────────────────────────────
    if (flowState === "run" && isGameRunClockRunning()) {
      useGameplayStore.getState().flushPendingSpawnEvents();
      const cfg = SETTINGS.spawner;
      const runSeconds = getGameRunClockSeconds();
      if (cfg.enabled && templates.length > 0) {
        const spawnPos = spawnMarkerRef.current?.getPosition();
        if (spawnPos) {
          const spawnerState = useSpawnerStore.getState();
          const totalActiveCount = spawnerState.activeCount;
          const spawnRateMultiplier = resolveAccelerationMultiplier(
            cfg.spawnAcceleration,
            cfg.spawnAccelerationCurve,
            runSeconds,
          );
          const maxItemsMultiplier = resolveAccelerationMultiplier(
            cfg.maxItemsAcceleration,
            cfg.maxItemsAccelerationCurve,
            runSeconds,
          );
          const baseIntervalSec = Math.max(0.001, cfg.spawnIntervalMs / 1000);
          const effectiveIntervalSec =
            baseIntervalSec / Math.max(0.0001, spawnRateMultiplier);
          const maxItemsCap = Math.max(1, Math.trunc(cfg.maxItemsCap));
          const effectiveMaxItems = Math.max(
            1,
            Math.min(
              maxItemsCap,
              Math.round(cfg.maxItems * Math.max(0, maxItemsMultiplier)),
            ),
          );
          const availableBonusSlots = Math.max(
            0,
            maxItemsCap - totalActiveCount,
          );

          if (availableBonusSlots > 0) {
            const queuedSpawns = consumeQueuedSpawns(availableBonusSlots);
            for (let i = 0; i < queuedSpawns.length; i += 1) {
              const queuedSpawn = queuedSpawns[i];
              const itemDefinition = resolveSpawnItemDefinitionById(queuedSpawn?.itemId);
              if (!queuedSpawn || !itemDefinition) continue;

              const spawnId = `spawn-${++spawnIdRef.current}`;
              const added = addItem({
                id: spawnId,
                itemId: itemDefinition.id,
                spawnItem: itemDefinition,
                radius: cfg.radius,
                templateIndex: Math.floor(Math.random() * templates.length),
                position: [
                  spawnPos.x + queuedSpawn.xOffset,
                  SPAWN_HEIGHT + queuedSpawn.yOffset,
                  spawnPos.z,
                ],
              }, maxItemsCap);
              if (added) {
                registerEntity(spawnId, "spawned_item");
              }
            }
          }

          spawnTimerRef.current += delta;
          while (spawnTimerRef.current >= effectiveIntervalSec) {
            const currentState = useSpawnerStore.getState();
            const currentDefaultPoolCount = countDefaultPoolItems(currentState.items);
            const currentScore = useGameplayStore.getState().score;
            if (
              currentDefaultPoolCount >= effectiveMaxItems
              || currentState.activeCount >= maxItemsCap
            ) {
              break;
            }

            spawnTimerRef.current -= effectiveIntervalSec;
            const currentActiveCountsByItemId = countItemsByItemId(currentState.items);
            const itemDefinition = pickWeightedSpawnItemDefinition(
              currentActiveCountsByItemId,
              runSeconds,
              currentScore,
            );
            if (!itemDefinition) continue;
            const spawnXRange = Math.max(0, cfg.spawnXRange);
            const xOffset = cfg.spawnXRangeOffset + (Math.random() * 2 - 1) * spawnXRange;
            const itemId = `spawn-${++spawnIdRef.current}`;
            const added = addItem({
              id: itemId,
              itemId: itemDefinition.id,
              spawnItem: itemDefinition,
              radius: cfg.radius,
              templateIndex: Math.floor(Math.random() * templates.length),
              position: [spawnPos.x + xOffset, SPAWN_HEIGHT, spawnPos.z],
            }, maxItemsCap);
            if (added) {
              registerEntity(itemId, "spawned_item");
            }
          }
        }
      }
    }

    // ── Cull ──────────────────────────────────────────────────────────────
    const cullPos = cullMarkerRef.current?.getPosition();
    if (!cullPos) return;
    const cullZ = cullPos.z + (SETTINGS.spawner.cullOffset ?? 0);

    const toRemove: string[] = [];
    cullGettersRef.current.forEach((getZ, id) => {
      const z = getZ();
      if (z !== undefined && z > cullZ) toRemove.push(id);
    });

    for (const id of toRemove) {
      removeSpawnedItem(id);
    }
  });

  const makeRegisterCullZ = useCallback(
    (id: string) => (getter: ZGetter) => {
      cullGettersRef.current.set(id, getter);
      return () => { cullGettersRef.current.delete(id); };
    },
    [],
  );

  const makeCleanupRequested = useCallback(
    (id: string) => () => {
      removeSpawnedItem(id);
    },
    [removeSpawnedItem],
  );

  return (
    <group>
      {items.map((item) => (
        <SpawnedItemView
          key={item.id}
          item={item}
          templates={templates}
          onRegisterCullZ={makeRegisterCullZ(item.id)}
          onCleanupRequested={makeCleanupRequested(item.id)}
          autoPopSignal={autoPopSignal}
          autoPopStaggerMs={GAME_OVER_AUTO_POP_STAGGER_MS}
        />
      ))}
    </group>
  );
}
