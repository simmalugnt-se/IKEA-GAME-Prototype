import { useEntityStore } from "@/entities/entityStore";
import { getGameRunClockSeconds, isGameRunClockRunning } from "@/game/GameRunClock";
import { useGameplayStore } from "@/gameplay/gameplayStore";
import {
  useSpawnerStore,
  type SpawnedItemDescriptor,
} from "@/gameplay/spawnerStore";
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
const GAME_OVER_AUTO_POP_STAGGER_MS = 25;

type ZGetter = () => number | undefined;

function SpawnedItemView({
  item,
  templates,
  onRegisterCullZ,
  onCleanupRequested,
  autoPopSignal,
  autoPopDelayMs,
}: {
  item: SpawnedItemDescriptor;
  templates: ReactElement[];
  onRegisterCullZ: (getter: ZGetter) => () => void;
  onCleanupRequested: () => void;
  autoPopSignal: number;
  autoPopDelayMs: number;
}) {
  if (templates.length === 0) return null;
  const template = templates[item.templateIndex % templates.length];

  return cloneElement(template as ReactElement<Record<string, unknown>>, {
    position: item.position,
    onRegisterCullZ,
    onCleanupRequested,
    autoPopSignal,
    autoPopDelayMs,
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
  const flowEpoch = useGameplayStore((state) => state.flowEpoch);
  const spawnTimerRef = useRef(0);
  const spawnIdRef = useRef(0);
  const cullGettersRef = useRef<Map<string, ZGetter>>(new Map());
  const previousFlowStateRef = useRef(flowState);
  const autoPopDelayByItemIdRef = useRef<Map<string, number>>(new Map());
  const [autoPopSignal, setAutoPopSignal] = useState(0);

  const templates = useMemo(() => {
    return Children.toArray(children).filter(
      (child): child is ReactElement =>
        typeof child === "object" && child !== null && "type" in child,
    );
  }, [children]);

  const items = useSpawnerStore((state) => state.items);
  const addItem = useSpawnerStore((state) => state.addItem);
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
      if (flowState !== "game_over_travel") {
        autoPopDelayByItemIdRef.current.clear();
      }
      return;
    }

    const activeItems = useSpawnerStore.getState().items;
    const nextDelayMap = new Map<string, number>();
    for (let i = 0; i < activeItems.length; i += 1) {
      const item = activeItems[i];
      if (!item) continue;
      nextDelayMap.set(item.id, i * GAME_OVER_AUTO_POP_STAGGER_MS);
    }
    autoPopDelayByItemIdRef.current = nextDelayMap;
    setAutoPopSignal((signal) => signal + 1);
  }, [flowEpoch, flowState]);

  const removeSpawnedItem = useCallback((id: string) => {
    cullGettersRef.current.delete(id);
    autoPopDelayByItemIdRef.current.delete(id);
    useEntityStore.getState().unregister(id);
    useSpawnerStore.getState().removeItem(id);
  }, []);

  useFrame((_state, delta) => {
    // ── Spawn ─────────────────────────────────────────────────────────────
    if (flowState === "run" && isGameRunClockRunning()) {
      const cfg = SETTINGS.spawner;
      const runSeconds = getGameRunClockSeconds();
      if (cfg.enabled && templates.length > 0) {
        const spawnPos = spawnMarkerRef.current?.getPosition();
        if (spawnPos) {
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

          spawnTimerRef.current += delta;
          while (
            spawnTimerRef.current >= effectiveIntervalSec &&
            useSpawnerStore.getState().activeCount < effectiveMaxItems
          ) {
            spawnTimerRef.current -= effectiveIntervalSec;
            const xOffset = (Math.random() * 2 - 1) * cfg.spawnXRange;
            const itemId = `spawn-${++spawnIdRef.current}`;
            addItem({
              id: itemId,
              radius: cfg.radius,
              templateIndex: Math.floor(Math.random() * templates.length),
              position: [spawnPos.x + xOffset, SPAWN_HEIGHT, spawnPos.z],
            }, effectiveMaxItems);
            registerEntity(itemId, "spawned_item");
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
          autoPopDelayMs={autoPopDelayByItemIdRef.current.get(item.id) ?? 0}
        />
      ))}
    </group>
  );
}
