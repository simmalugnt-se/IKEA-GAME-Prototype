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
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";

const SPAWN_HEIGHT = 1.3;

type ZGetter = () => number | undefined;

function SpawnedItemView({
  item,
  templates,
  onRegisterCullZ,
}: {
  item: SpawnedItemDescriptor;
  templates: ReactElement[];
  onRegisterCullZ: (getter: ZGetter) => () => void;
}) {
  if (templates.length === 0) return null;
  const template = templates[item.templateIndex % templates.length];

  return cloneElement(template as ReactElement<Record<string, unknown>>, {
    position: item.position,
    onRegisterCullZ,
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
      cullGettersRef.current.delete(id);
      useEntityStore.getState().unregister(id);
      useSpawnerStore.getState().removeItem(id);
    }
  });

  const makeRegisterCullZ = useCallback(
    (id: string) => (getter: ZGetter) => {
      cullGettersRef.current.set(id, getter);
      return () => { cullGettersRef.current.delete(id); };
    },
    [],
  );

  return (
    <group>
      {items.map((item) => (
        <SpawnedItemView
          key={item.id}
          item={item}
          templates={templates}
          onRegisterCullZ={makeRegisterCullZ(item.id)}
        />
      ))}
    </group>
  );
}
