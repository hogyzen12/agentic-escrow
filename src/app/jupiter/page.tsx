'use client';

import React from "react";
import JupiterScene from "../components/JupiterScene"; // Adjust the path if your JupiterScene is located elsewhere

const JupiterPage: React.FC = () => {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Jupiter Simulation</h1>
      <JupiterScene />
    </div>
  );
};

export default JupiterPage;
