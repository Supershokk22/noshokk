---
name: criar-mods
description: Use quando o usuário pedir para criar mods para qualquer jogo — Unity (BepInEx/MelonLoader), Unreal (UE4SS/LogicMods/Pak), Godot (ModLoader) ou Java/Minecraft (Forge/Fabric). Cobre setup, injeção, empacotamento e distribuição.
---

# Criar Mods — Skill Universal (Unity | Unreal | Godot | Java)

Skill especialista do Noshokk para **criar, testar e distribuir mods** em qualquer engine. Escolha a seção da engine alvo; o fluxo é sempre: **Setup → Criar → Referenciar → Build → Testar → Empacotar → Distribuir**.

## 0) Diagnóstico rápido (antes de codar)

| Pergunta | Resposta → Engine/Tool |
|---|---|
| Pasta `_Data/Managed` existe? | **Unity Mono** → BepInEx |
| Pasta `GameAssembly.dll` + `il2cpp_data`? | **Unity Il2Cpp** → BepInEx 6 / MelonLoader 0.6.2+ |
| Pasta `Paks/LogicMods` ou `UE4SS`? | **Unreal** → UE4SS |
| `manifest.json` + `mod_main.gd`? | **Godot** → ModLoader |
| `mods.toml` + `mods` em `.minecraft`? | **Java/Minecraft** → Forge/Fabric |

## 1) Unity — BepInEx (recomendado)

**Fluxo oficial BepInEx.Templates**

```powershell
# 1. Descobrir TFM e Unity
# TFM: netstandard2.1 se tem netstandard.dll (Unity 2021.2+), senão net472/net35
# Unity: rode com BepInEx 1x e veja o console, ou clique direito no .exe → Detalhes

# 2. Criar projeto
dotnet new -i BepInEx.Templates --nuget-source https://nuget.bepinex.dev/v3/index.json
dotnet new bep6plugin_unity_mono -n MeuMod -T netstandard2.1 -U 2020.3.24
dotnet restore MeuMod

# 3. Referenciar jogo (não copie mscorlib/System.*)
# Crie pasta MeuMod/lib e copie Assembly-CSharp.dll do jogo (em _Data/Managed)
# No .csproj:
# <ItemGroup><Reference Include="Assembly-CSharp"><HintPath>lib/Assembly-CSharp.dll</HintPath></Reference></ItemGroup>
```

```csharp
// Plugin.cs
using BepInEx;
using BepInEx.Logging;
using UnityEngine;

[BepInPlugin("seu.nome.meumod", "MeuMod", "1.0.0")]
public class Plugin : BaseUnityPlugin {
  internal static ManualLogSource Log;
  void Awake() {
    Log = Logger;
    Log.LogInfo("MeuMod carregado!");
    // Harmony patch: Logger.LogInfo("patch aplicado");
  }
  void Update() {
    if (Input.GetKeyDown(KeyCode.F1)) {
      // exemplo: godmode via classe do jogo descoberta no dnSpy
      // var player = FindObjectOfType<Player>();
      // player.health = 999;
    }
  }
}
```

**Build & Teste**
```powershell
dotnet build
# copie bin/Debug/netstandard2.1/MeuMod.dll → <Jogo>/BepInEx/plugins/
# rode o jogo, veja BepInEx console: [Info : MeuMod] MeuMod carregado!
```
**Dica Il2Cpp**: use `BepInEx 6` + template `bep6plugin_unity_il2cpp`; após 1 execução copie `BepInEx/interop/*` como referência.

**Alternativa MelonLoader** (Unity, mais simples para iniciantes)
```csharp
[assembly: MelonInfo(typeof(MeuMod), "MeuMod", "1.0.0", "SeuNome")]
[assembly: MelonGame("DevDoJogo", "NomeDoJogo")]
public class MeuMod : MelonMod {
  public override void OnInitializeMelon() => LoggerInstance.Msg("Hello!");
  public override void OnUpdate() {
    if (Input.GetKeyDown(KeyCode.Delete)) { /* toggle */ }
  }
}
// Build → .dll em Mods/
```
Use `dnSpy` para achar classes como `Player`, `EntityManager.MainPlayer`.

## 2) Unreal — UE4SS (Unreal 4/5)

### 2A) LogicMods (Blueprint, sem C++)
```
Pal.uproject/Content/Mods/MeuMod/
  ModActor (Blueprint Actor) + PrimaryAssetLabel (ChunkID=1, AlwaysCook)
```
- Crie `ModActor` com `BeginPlay` → `PrintToModLoader` + lógica (ex: `Set Sprint SP`)
- Package: `Platforms → Windows → Package Project` → `pakchunk1-Windows.pak` → renomeie para `MeuMod.pak` → `<Jogo>/Content/Paks/LogicMods/MeuMod.pak`
- Ative em `Mods/mods.txt`: `BPModLoaderMod : 1` e `ConsoleEnabled = 1` em `UE4SS-settings.ini`.

### 2B) C++ Mod (UE4SS)
```
MyMods/MyMod/CMakeLists.txt:
  add_library(MyMod SHARED dllmain.cpp)
  target_link_libraries(MyMod PUBLIC UE4SS)
dllmain.cpp:
  class MeuMod : public RC::CppUserModBase {
    MeuMod():CppUserModBase(){ ModName=STR("MeuMod"); ModVersion=STR("1.0"); }
    auto on_update() -> void override { /* por tick */ }
    auto on_unreal_init() -> void override {
      auto Obj = UObjectGlobals::StaticFindObject<UObject*>(nullptr,nullptr,STR("/Script/CoreUObject.Object"));
      Output::send<LogLevel::Verbose>(STR("Found {}\n"), Obj->GetFullName());
    }
  };
```
Build Ninja/VS → `.dll` em `Binaries/Win64/Mods/MeuMod/dlls/`.

### 2C) Pak Mod puro
```
Mod_P/GameName/Content/... (mesma estrutura do FModel)
→ arraste Mod_P em UnrealPak-With-compression.bat → Mod_P.pak → <Jogo>/Content/Paks/Mod_P.pak
→ se tem .sig (UE4.27-), duplique .sig do jogo e renomeie para Mod_P.sig
```

## 3) Godot — ModLoader (GDScript, ZIPs)

**Estrutura obrigatória**
```
res://mods-unpacked/Autor-NomeMod/
  manifest.json
  mod_main.gd
```

```json
// manifest.json
{
  "name": "MeuModGodot",
  "namespace": "SeuNome",
  "version_number": "1.0.0",
  "description": "Adiciona indicador de sono",
  "dependencies": [],
  "extra": { "compatible_mod_loader_version": ["6.0.0"], "compatible_game_version": ["1.0.0"] }
}
```

```gdscript
// mod_main.gd
extends Node
const LOG = "SeuNome-MeuMod"
func _init(): ModLoaderLog.info("Init", LOG)
func _ready():
  ModLoaderLog.info("Pronto", LOG)
  # API: estenda scripts vanilla sem distribuir arquivos originais
  # ModLoaderMod.add_script_extension("res://scripts/player.gd", "res://mods-unpacked/Autor-Mod/mod/player_extension.gd")
```

**Teste:** habilite `addons/mod_loader/options/profiles/current.tres → Enable Mods`, rode o projeto, o ZIP em `/mods` será carregado.

## 4) Java / Minecraft — Forge & Fabric

**Setup (Gradle, MDK)**
```powershell
# Forge 1.20.1
# baixe MDK do files.minecraftforge.net, descompacte
gradlew genIntellijRuns # ou eclipse
# Fabric: use fabric-example-mod template do GitHub
```

```java
// Forge - src/main/java/com/seunome/meumod/MeuMod.java
@Mod("meumod")
public class MeuMod {
  public static final String MOD_ID = "meumod";
  public MeuMod() {
    IEventBus bus = FMLJavaModLoadingContext.get().getModEventBus();
    bus.addListener(this::setup);
    MinecraftForge.EVENT_BUS.register(this);
  }
  void setup(FMLCommonSetupEvent e) { LOGGER.info("MeuMod init"); }
  @SubscribeEvent
  public void onPlayerTick(TickEvent.PlayerTickEvent e) {
    if (e.player.isShiftKeyDown()) e.player.heal(1.0f);
  }
}
// Fabric - fabric.mod.json + ModInitializer
public class MeuMod implements ModInitializer {
  public void onInitialize() { System.out.println("MeuMod Fabric"); }
}
```
**Build:** `gradlew build` → `.jar` em `build/libs/` → `mods/` do Minecraft.

## 5) Princípios Universais de Modding

- **Nunca distribua arquivos vanilla** — use patches, extensions, overwrites via loader.
- **Versionamento**: `manifest`/`mods.toml` com `compatible_game_version`, teste após cada update do jogo.
- **Harmony / Hook**: prefira `Harmony.Patch` (C#) ou `ModLoaderMod.add_script_extension` (Godot) a editar DLLs.
- **Anti-cheat**: BepInEx/MelonLoader são detectados em jogos com EAC/BattlEye — avise usuário, use bypass apenas offline.
- **Debug**: `dnSpy` (Unity), `FModel` + `UE4SS dump` (Unreal), `DataStoreService pcall` (Roblox), `ModLoaderLog` (Godot).
- **Distribuição**: Unity → `BepInEx/plugins/*.dll`; Unreal → `Paks/LogicMods/*.pak` ou `Mods/*.dll`; Godot → `mods/*.zip` (Thunderstore/Workshop); Java → `mods/*.jar` (CurseForge/Modrinth).

## 6) Checklist Noshokk antes de gerar o mod

1. **Jogo alvo?** Pergunte nome + onde está instalado (Steam → Browse local files).
2. **Backend?** Verifique `_Data/Managed` vs `GameAssembly.dll` vs `Paks`.
3. **Template correto?** BepInEx Mono/Il2Cpp, UE4SS Logic vs C++, Godot manifest, Forge/Fabric.
4. **Referências?** Copie `Assembly-CSharp.dll` para `lib/` e referencie, nunca `mscorlib`.
5. **Teste incremental**: `Logger.LogInfo` / `PrintToModLoader` primeiro, gameplay depois.

## Referências

- BepInEx Docs: docs.bepinex.dev (plugin_tutorial), Ultramodding ULTRAKILL, MelonWiki
- UE4SS Docs: docs.ue4ss.com (creating-a-c++-mod, lua-mod, LogicMods), pwmodding.wiki
- GodotModding: github.com/GodotModding/godot-mod-loader + wiki.godotmodding.com
- Forge: files.minecraftforge.net, Fabric: fabricmc.net

> No Noshokk, este arquivo vive em `skills/criar-mods/SKILL.md` e é copiado para `%APPDATA%\hermes-app\skills\criar-mods\SKILL.md` no primeiro uso.
