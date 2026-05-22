const FR = {
  "Dashboard": "Tableau de bord",
  "Console": "Console",
  "Players": "Joueurs",
  "Plugins": "Plugins",
  "Wipe Manager": "Gestionnaire Wipe",
  "Server Settings": "Paramètres Serveur",
  "Messages": "Messages",
  "Times": "Programmation",
  "RCON": "RCON",
  "Sauvegardes": "Sauvegardes",
  "Discord": "Discord",
  "App Settings": "Réglages",
  "Installer": "Installateur",
};

export function t(key, lang) {
  if (lang === "en") return key;
  return FR[key] ?? key;
}
