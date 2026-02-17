/**
 * PuckEditor -- thin wrapper around @measured/puck (or @puckeditor/core).
 *
 * Renders the Puck visual page builder with the provided config and data,
 * forwarding save/publish callbacks to the host application.
 */
import React, { useCallback } from 'react';
import { Puck } from '@measured/puck';
import type { Config, Data } from '@measured/puck';
import '@measured/puck/puck.css';

export interface PuckEditorProps {
  /** Puck component config (built via buildPuckConfig) */
  config: Config;
  /** Current page data (Puck Data JSON) */
  data: Data;
  /** Called when the user clicks "Publish" inside Puck */
  onSave: (data: Data) => void;
  /** Optional callback fired after onSave completes */
  onPublish?: () => void;
}

export function PuckEditor({
  config,
  data,
  onSave,
  onPublish,
}: PuckEditorProps) {
  const handlePublish = useCallback(
    (newData: Data) => {
      onSave(newData);
      onPublish?.();
    },
    [onSave, onPublish],
  );

  return <Puck config={config} data={data} onPublish={handlePublish} />;
}
