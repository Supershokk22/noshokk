---
name: programacao-jogos
description: Use quando o usuário pedir para criar, debugar, otimizar ou arquitetar jogos em Unity (C#), Unreal (C++/Blueprint), Godot (GDScript) ou Roblox (Luau). Cobre game loop, ECS, State, Observer, Object Pool, SOLID e workflows de cada engine.
---

# Programação de Jogos — Skill Universal

Skill agregada para o Noshokk. Reúne o melhor de 4 engines + padrões universais. Use como checklist antes de escrever qualquer linha de gameplay.

## Quando usar

- Usuário diz "crie um jogo", "faça um personagem", "otimize meu jogo", "meu jogo está lento"
- Projeto tem `*.cs` (Unity), `*.cpp/*.h` + Blueprints (Unreal), `*.gd` (Godot), `*.rbxl`/`*.lua`/`*.luau` (Roblox/Rojo)
- Precisa escolher engine, padrão ou corrigir arquitetura

## 1) Escolha da Engine (rápido)

| Objetivo | Engine | Linguagem | Quando |
|---|---|---|---|
| 2D/3D mobile/PC, time misto | **Unity 6** | C# | Precisa de 25+ plataformas, Asset Store, ECS opcional |
| AAA 3D, mundo aberto, alta fidelidade | **Unreal 5.7** | C++ + Blueprint | Nanite/Lumen, time com designers + programadores |
| Indie leve, open-source | **Godot 4** | GDScript/C# | Sem royalties, nodes/scenes |
| Multiplayer social, UGC | **Roblox Studio** | Luau | Publicação instantânea, monetização Roblox |

## 2) Padrões Universais (use em qualquer engine)

### Game Loop
```pseudo
while (running) {
  handleInput()
  update(deltaTime)   // lógica
  physics(deltaTime)  // FixedUpdate / _physics_process
  render()            // LateUpdate / _process
}
```
- Separe **lógica** de **apresentação** (MVP/MVVM). Lógica deve rodar sem renderizar (para testes).

### ECS (Entity-Component-System)
- **Entity** = ID puro
- **Component** = dados (ex: `Position`, `Velocity`)
- **System** = lógica que processa entidades com certos componentes
- Use para 100+ entidades (inimigos, projéteis). Unity DOTS, Godot `MultiMesh`, Unreal Mass.

### State Pattern
```csharp
// Unity/C#
interface IState { void Enter(); void Update(); void Exit(); }
class Enemy : MonoBehaviour {
  IState patrol, chase, attack; IState current;
  void Update() => current.Update();
}
```
- Inimigo: `Idle -> Patrol -> Chase -> Attack`. Evita `if/else` gigante.

### Observer (Eventos)
```gdscript
# Godot
signal ammo_collected
ammo_collected.connect(_on_ammo_collected) # UI, som, animação reagem
```
- Player coleta munição → dispara evento → UI, som e animação escutam. Desacopla.

### Object Pool (obrigatório para projéteis)
```csharp
// Unity - em vez de Instantiate/Destroy a cada tiro
Bullet b = pool.Get();
b.transform.position = muzzle.position;
b.gameObject.SetActive(true);
// ao colidir: pool.Release(b); // SetActive(false) + reset
```
- Evita GC spikes. Mesma ideia em Godot (`queue_free` → pool) e Roblox (`Part.Parent = nil` → reutiliza).

### Command
- Encapsula input como objeto → undo/redo, replay, fila de turnos (jogo de estratégia).

## 3) Unity 6 — Regras de Ouro (C#)

**Do ebook Unity + Manual:**
- **SOLID**: cada classe 1 motivo pra mudar; estenda sem modificar (Factory para powerups).
- **Cache tudo**: `GetComponent` no `Awake()`, nunca no `Update()`. Cache `WaitForSeconds`.
- **Nunca** LINQ, `string` concat ou reflection em `Update/FixedUpdate`.
- **1 Update centralizado** > 100 `MonoBehaviour.Update`. Use `Custom Update Manager` ou `PlayerLoop`.
- **Object Pool** para tiros/partículas. `Destroy` → `DestroyImmediate` só no Editor.
- **Assembly Definitions** + `#if UNITY_EDITOR` para separar Editor/Runtime.
- **Profiler + Project Auditor** antes de otimizar. Jobs + Burst + `NativeArray` para hot paths.

```csharp
// Factory para powerups
interface IPowerUp { void Apply(Player p); }
class PowerUpFactory {
  public IPowerUp Create(string id) => id switch {
    "shield" => new Shield(),
    "speed" => new SpeedBoost(),
    _ => throw new ArgumentException()
  };
}
```

## 4) Unreal 5.7 — Híbrido C++ / Blueprint

**Regra Epic 2026: use os dois, cada um onde brilha.**

- **C++** (programadores): sistemas core, hot paths, math pesado, replication, `UFUNCTION(BlueprintCallable)` para expor.
```cpp
UFUNCTION(BlueprintCallable, Category="Combat")
float CalcDamage(float Base, float Crit) { return Base * (Crit ? 2.f : 1.f); } // Blueprint chama
```
- **Blueprint** (designers): `BP_Goblin : ABaseEnemy`, `GA_Fireball`, UI `WBP_Inventory`, level scripting, triggers.
- **Performance**: Blueprint VM = interpretado. Hot paths (movimento, AI de 100+ agentes, raycasts) → C++ senão 10x mais lento. Eventos únicos (BeginPlay, pickup) → Blueprint ok.
- **Nativization removido no UE5** → otimize manualmente: profile no Unreal Insights, reescreva hot Blueprint como `UHealthComponent` base em C++.
- **Padrão interface**:
```cpp
UINTERFACE()
class IInteractable : public UInterface { GENERATED_BODY() };
class IInteractable { GENERATED_BODY() public:
  UFUNCTION(BlueprintNativeEvent) bool CanInteract(AActor* Instigator) const;
  UFUNCTION(BlueprintNativeEvent) void OnInteract(AActor* Instigator);
};
```

## 5) Godot 4 — Nodes, Scenes, Signals

- **Scene = árvore de Nodes**. Prefira `Node` + `Scene` para tudo (Player é `CharacterBody2D` + `Sprite2D` + `CollisionShape2D`).
- **Signals** = Observer nativo. Conecte via `signal.connect()` no `_ready()`.
- **_process(delta)** vs **_physics_process(delta)**: lógica visual vs física. Nunca misture.
- **GDScript** tipado gradual:
```gdscript
var speed: float = 300.0
func _physics_process(delta: float):
  velocity = Input.get_vector("left","right","up","down") * speed
  move_and_slide()
```
- **Reuso**: `PackedScene` + `instantiate()` + `add_child()`. Para muitos inimigos, use `MultiMeshInstance2D`.

## 6) Roblox Studio — Luau

- **Luau** = Lua 5.1 + tipos opcionais, `local` sempre, 1-based arrays, `task.wait()` não `wait()`.
- **Server vs Client**: `Script` (ServerScriptService) = servidor autoritativo; `LocalScript` (StarterPlayerScripts) = cliente; `ModuleScript` = biblioteca compartilhada.
- **Comunicação**: `RemoteEvent` (fire-and-forget) / `RemoteFunction` (request/response). Valide tudo no servidor.
```lua
-- ServerScriptService/GameManager (Script)
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local coinEvent = ReplicatedStorage:WaitForChild("CoinCollected") -- RemoteEvent
coinEvent.OnServerEvent:Connect(function(player)
  -- valida distância, anti-cheat, dá moeda
  player.leaderstats.Coins.Value += 1
end)
-- LocalScript (cliente) dispara: coinEvent:FireServer()
```
- **Performance**: `while true do task.wait(3) disappear() end` — sempre `task.wait` no loop senão freeze.
- **Salvamento**: `DataStoreService` + `pcall` + versionamento.

## 7) Checklist Antes de Codar (Noshokk)

1. **Engine definida?** Se não, pergunte objetivo + time.
2. **Padrão escolhido?** 100+ entidades → ECS; NPC com estados → State; projéteis → Pool; eventos → Observer.
3. **Separação lógica/apresentação?** Consigo rodar `update()` sem render?
4. **Cache e GC?** `GetComponent`/`find` fora do loop, sem LINQ/string em hot path, Pool no lugar de Instantiate.
5. **Unreal: C++ base + Blueprint filho?** Se for hot path, já vai pra C++.
6. **Roblox: validação no servidor?** Nunca confie no cliente.

## 8) Snippets Prontos

**Godot State + Pool + Observer completo:** peça "gere um inimigo com State e Pool em Godot" que o modelo expande.

**Unity Singleton seguro:**
```csharp
public class GameManager : MonoBehaviour {
  public static GameManager I { get; private set; }
  void Awake() {
    if (I != null && I != this) { Destroy(gameObject); return; }
    I = this; DontDestroyOnLoad(gameObject); // só se precisar entre cenas — prefira Addictive load
  }
}
```

**Luau DataStore com retry:**
```lua
local DS = game:GetService("DataStoreService"):GetDataStore("PlayerData")
local ok, data = pcall(function() return DS:GetAsync(player.UserId) end)
if not ok then warn("falha ao carregar") end
```

## Referências

- Unity: Level up your code with design patterns and SOLID (ebook Unity 6), docs.unity3d.com/Manual/programming-best-practices.html
- Unreal: Epic Mixing Blueprints and C++ + StraySpark Blueprints vs C++ 2026 Guide
- Roblox: create.roblox.com/docs/scripting + luau + tutorials/intro-to-scripting
- Godot: docs.godotengine.org (Scene/Signals/_process)

> No Noshokk, toda skill salva em `skills/programacao-jogos/SKILL.md` e aparece no **Skills Editor** na próxima reinicialização.
