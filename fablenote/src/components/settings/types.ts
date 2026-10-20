import React from "react";
import { Settings as SettingsType } from "../../types";

/** Réglages modifiés dans le formulaire, enregistrés par le bouton « Sauvegarder ». */
export interface SettingsFormProps {
  form: SettingsType;
  set: (key: keyof SettingsType, value: string | number | boolean) => void;
  setForm: React.Dispatch<React.SetStateAction<SettingsType>>;
}
