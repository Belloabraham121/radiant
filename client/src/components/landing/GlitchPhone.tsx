"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Float, RoundedBox } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { PHONE_APPS, type PhoneApp } from "../hero/apps";
import { makeScreenTexture } from "../hero/screen-textures";

type GlitchState = {
  currentId: PhoneApp["id"];
  glitchUntil: number;
  swapAt: number;
  swapped: boolean;
  punch: number;
  nextAmbient: number;
};

function PhoneRig({ app, reduced }: { app: PhoneApp; reduced: boolean }) {
  const jitter = useRef<THREE.Group>(null);
  const spinner = useRef<THREE.Group>(null);
  const screenMat = useRef<THREE.MeshBasicMaterial>(null);
  const ghostR = useRef<THREE.Mesh>(null);
  const ghostB = useRef<THREE.Mesh>(null);
  const ghostRMat = useRef<THREE.MeshBasicMaterial>(null);
  const ghostBMat = useRef<THREE.MeshBasicMaterial>(null);
  const bodyMat = useRef<THREE.MeshStandardMaterial>(null);

  const textures = useMemo(() => {
    const map = new Map<PhoneApp["id"], THREE.CanvasTexture>();
    for (const a of PHONE_APPS) map.set(a.id, makeScreenTexture(a));
    return map;
  }, []);

  useEffect(() => {
    return () => {
      for (const t of textures.values()) t.dispose();
    };
  }, [textures]);

  const state = useRef<GlitchState>({
    currentId: app.id,
    glitchUntil: 0,
    swapAt: 0,
    swapped: true,
    punch: 0,
    nextAmbient: 3,
  });

  useFrame(({ clock }, delta) => {
    const j = jitter.current;
    const sp = spinner.current;
    const screen = screenMat.current;
    const body = bodyMat.current;
    if (!j || !sp || !screen || !body) return;

    const t = clock.elapsedTime;
    const s = state.current;

    if (!reduced) {
      sp.rotation.y += delta * 0.5;
      sp.rotation.x = Math.sin(t * 0.6) * 0.04;
    }

    // new app arrived → schedule a glitch burst, swap texture mid-burst
    if (app.id !== s.currentId) {
      s.currentId = app.id;
      if (reduced) {
        screen.map = textures.get(app.id)!;
        body.color.set(app.accent);
        s.swapped = true;
      } else {
        s.glitchUntil = t + 0.5;
        s.swapAt = t + 0.2;
        s.swapped = false;
      }
    }

    if (!s.swapped && t >= s.swapAt) {
      const tex = textures.get(s.currentId)!;
      screen.map = tex;
      if (ghostRMat.current) ghostRMat.current.map = tex;
      if (ghostBMat.current) ghostBMat.current.map = tex;
      body.color.set(app.accent);
      s.punch = 1;
      s.swapped = true;
    }

    // ambient micro-glitches so the phone always feels a little electric
    if (!reduced && t >= s.nextAmbient) {
      s.glitchUntil = Math.max(s.glitchUntil, t + 0.12);
      s.nextAmbient = t + 3.5 + Math.random() * 4;
    }

    const glitching = !reduced && t < s.glitchUntil;

    if (glitching) {
      j.position.x = (Math.random() - 0.5) * 0.16;
      j.position.y = (Math.random() - 0.5) * 0.1;
      j.rotation.z = (Math.random() - 0.5) * 0.14;
      screen.map!.offset.y = Math.random() < 0.4 ? (Math.random() - 0.5) * 0.06 : 0;
      if (ghostR.current && ghostB.current) {
        const show = Math.random() > 0.15;
        ghostR.current.visible = show;
        ghostB.current.visible = show;
        ghostR.current.position.x = 0.02 + Math.random() * 0.05;
        ghostB.current.position.x = -0.02 - Math.random() * 0.05;
      }
    } else {
      j.position.x = 0;
      j.position.y = 0;
      j.rotation.z = 0;
      if (screen.map) screen.map.offset.y = 0;
      if (ghostR.current) ghostR.current.visible = false;
      if (ghostB.current) ghostB.current.visible = false;
    }

    // scale punch right after a swap, decaying back to rest
    s.punch *= Math.exp(-delta * 7);
    const scale = 1 + s.punch * 0.14;
    j.scale.setScalar(scale);
  });

  const initialTexture = textures.get(app.id)!;

  return (
    <group ref={jitter}>
      <Float
        speed={reduced ? 0 : 1.3}
        rotationIntensity={reduced ? 0 : 0.1}
        floatIntensity={reduced ? 0 : 0.35}
      >
        <group ref={spinner} rotation={[0, -0.4, 0]}>
          <RoundedBox args={[1, 2.16, 0.11]} radius={0.085} smoothness={6}>
            <meshStandardMaterial
              ref={bodyMat}
              color={app.accent}
              roughness={0.32}
              metalness={0.08}
            />
          </RoundedBox>
          <mesh position={[0, 0, 0.058]}>
            <planeGeometry args={[0.8, 1.9]} />
            <meshBasicMaterial ref={screenMat} map={initialTexture} toneMapped={false} />
          </mesh>
          {/* RGB-split ghost planes, only visible during glitch bursts */}
          <mesh ref={ghostR} position={[0.04, 0, 0.06]} visible={false}>
            <planeGeometry args={[0.8, 1.9]} />
            <meshBasicMaterial
              ref={ghostRMat}
              map={initialTexture}
              color="#ff2222"
              transparent
              opacity={0.55}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
              depthWrite={false}
            />
          </mesh>
          <mesh ref={ghostB} position={[-0.04, 0, 0.06]} visible={false}>
            <planeGeometry args={[0.8, 1.9]} />
            <meshBasicMaterial
              ref={ghostBMat}
              map={initialTexture}
              color="#22ddff"
              transparent
              opacity={0.55}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
              depthWrite={false}
            />
          </mesh>
          {/* notch */}
          <mesh position={[0, 0.86, 0.061]}>
            <planeGeometry args={[0.26, 0.055]} />
            <meshBasicMaterial color="#1b1610" />
          </mesh>
          {/* camera island on the back */}
          <mesh position={[-0.26, 0.78, -0.058]} rotation={[0, Math.PI, 0]}>
            <circleGeometry args={[0.13, 32]} />
            <meshStandardMaterial color="#1b1610" roughness={0.4} />
          </mesh>
          <mesh position={[-0.26, 0.78, -0.062]} rotation={[0, Math.PI, 0]}>
            <circleGeometry args={[0.055, 32]} />
            <meshStandardMaterial color="#fffdf7" roughness={0.15} metalness={0.4} />
          </mesh>
        </group>
      </Float>
      <ContactShadows
        position={[0, -1.6, 0]}
        opacity={0.3}
        scale={6}
        blur={2.6}
        far={3}
        color="#1b1610"
      />
    </group>
  );
}

export default function GlitchPhone({ app, reduced }: { app: PhoneApp; reduced: boolean }) {
  return (
    <Canvas
      camera={{ position: [0, 0.15, 5.4], fov: 30 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      frameloop={reduced ? "demand" : "always"}
    >
      <ambientLight intensity={1.15} />
      <directionalLight position={[4, 6, 6]} intensity={1.3} />
      <directionalLight position={[-5, 2, 4]} intensity={0.5} color="#ffe9c9" />
      <PhoneRig app={app} reduced={reduced} />
    </Canvas>
  );
}
