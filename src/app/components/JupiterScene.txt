'use client';

import React, { useRef, useEffect } from 'react';
import { Engine, Scene } from '@babylonjs/core';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3, Color3 } from '@babylonjs/core/Maths/math';

const JupiterScene: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | WebGPUEngine>();

  useEffect(() => {
    if (!canvasRef.current) return;
    let engine: Engine | WebGPUEngine;

    // Use WebGPU if available
    if (navigator.gpu) {
      engine = new WebGPUEngine(canvasRef.current);
      engine
        .initAsync()
        .then(() => {
          createScene(engine, canvasRef.current!);
        })
        .catch((err) => {
          console.error("WebGPU initialization failed, falling back to WebGL", err);
          engine = new Engine(canvasRef.current!, true);
          createScene(engine, canvasRef.current!);
        });
    } else {
      // Fallback to WebGL
      engine = new Engine(canvasRef.current, true);
      createScene(engine, canvasRef.current);
    }
    engineRef.current = engine;

    const handleResize = () => engine?.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (engineRef.current) {
        try {
          engineRef.current.dispose();
        } catch (err) {
          console.error("Error disposing engine:", err);
        }
      }
    };
  }, []);

  const createScene = (engine: Engine, canvas: HTMLCanvasElement) => {
    const scene = new Scene(engine);
    scene.clearColor = new Color3(0, 0, 0).toColor4();

    // ----------------------------
    // Create and position the camera
    // ----------------------------
    const camera = new ArcRotateCamera(
      "camera",
      -Math.PI / 2,
      Math.PI / 2.5,
      20,
      new Vector3(0, 0, 0),
      scene
    );
    camera.attachControl(canvas, true);

    // ----------------------------
    // Add a hemispheric light
    // ----------------------------
    const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
    light.intensity = 1;

    // ----------------------------
    // Create the skybox
    // ----------------------------
    const skybox = MeshBuilder.CreateBox("skyBox", { size: 1000 }, scene);
    const skyboxMaterial = new StandardMaterial("skyBoxMat", scene);
    skyboxMaterial.backFaceCulling = false;
    // Order: [right, left, up, down, front, back]
    const skyboxFiles = [
      "space_rt.png",
      "space_lf.png",
      "space_up.png",
      "space_dn.png",
      "space_ft.png",
      "space_bk.png"
    ];
    skyboxMaterial.reflectionTexture = new CubeTexture("/skybox/space/", scene, skyboxFiles);
    skyboxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
    skyboxMaterial.diffuseColor = new Color3(0, 0, 0);
    skyboxMaterial.specularColor = new Color3(0, 0, 0);
    skybox.material = skyboxMaterial;

    // ----------------------------
    // Create Jupiter (the planet)
    // ----------------------------
    const jupiter = MeshBuilder.CreateSphere("jupiter", { diameter: 3, segments: 32 }, scene);
    const jupiterMaterial = new StandardMaterial("jupiterMat", scene);
    jupiterMaterial.specularColor = new Color3(0, 0, 0);
    const jupiterTexture = new Texture(
      "/textures/2k_jupiter.jpg",
      scene,
      false,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
      () => { console.log("Jupiter texture loaded successfully."); },
      (message, exception) => { console.error("Failed to load Jupiter texture:", message, exception); }
    );
    jupiterMaterial.diffuseTexture = jupiterTexture;
    jupiter.material = jupiterMaterial;
    jupiter.position = new Vector3(0, 0, 0);

    // ----------------------------
    // Create the Galilean moons (Io, Europa, Ganymede, Callisto)
    // ----------------------------
    const galileanMoons = [
      { name: "Io", texture: "/textures/Io.jpeg", orbitRadius: 5.5, speed: 0.01, diameter: 0.5 },
      { name: "Europa", texture: "/textures/Europa.jpg", orbitRadius: 7, speed: 0.008, diameter: 0.6 },
      { name: "Ganymede", texture: "/textures/Ganymede.jpeg", orbitRadius: 9, speed: 0.006, diameter: 0.8 },
      { name: "Callisto", texture: "/textures/Callisto.jpg", orbitRadius: 11, speed: 0.005, diameter: 0.7 }
    ];

    // We'll create a pivot for each moon so it can orbit around Jupiter.
    const moonPivots: TransformNode[] = [];
    for (let i = 0; i < galileanMoons.length; i++) {
      const moonData = galileanMoons[i];
      // Create a pivot node at Jupiter's position.
      const pivot = new TransformNode(moonData.name + "Pivot", scene);
      pivot.position = jupiter.position.clone(); // at (0,0,0)
      moonPivots.push(pivot);

      // Create the moon mesh.
      const moon = MeshBuilder.CreateSphere(moonData.name, { diameter: moonData.diameter, segments: 16 }, scene);
      const moonMaterial = new StandardMaterial(moonData.name + "Mat", scene);
      moonMaterial.specularColor = new Color3(0, 0, 0);
      moonMaterial.diffuseTexture = new Texture(
        moonData.texture,
        scene,
        false,
        false,
        Texture.BILINEAR_SAMPLINGMODE
      );
      moon.material = moonMaterial;
      // Position the moon relative to its pivot.
      moon.position = new Vector3(moonData.orbitRadius, 0, 0);
      // Parent the moon to the pivot node.
      moon.parent = pivot;
    }

    // ----------------------------
    // Animation: Rotate Jupiter & Orbit the Moons
    // ----------------------------
    scene.registerBeforeRender(() => {
      // Rotate Jupiter slowly around its Y-axis.
      jupiter.rotation.y += 0.005;

      // Rotate each moon's pivot node so the moons orbit Jupiter.
      for (let i = 0; i < galileanMoons.length; i++) {
        moonPivots[i].rotation.y += galileanMoons[i].speed;
      }
    });

    engine.runRenderLoop(() => {
      scene.render();
    });
  };

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '500px',
        backgroundColor: '#000'
      }}
    />
  );
};

export default JupiterScene;
