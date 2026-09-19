# MEGA SKILL FINAL — Overdriver Project
# 1000+ fontes | Tudo que aprendemos
# Game hacking, Anti-Cheat, ESP, Wallhack, Reverse Engineering

---

## SEÇÃO 1: WALLHACK — O QUE SABEMOS

### Por que não funciona ainda:
1. **BattlEye bloqueia VirtualAllocEx** (erro 5: ACCESS_DENIED)
2. **ViewProj row3 = [1,1,1,1]** — offset 0x100 pode estar errado
3. **DLL injection** detectada pelo driver do BattlEye
4. **Ghidra** analisou mas não retornou output dos scripts

### O que JÁ funciona:
- ✅ KPRL driver lê/escreve memória (bypass BattlEye)
- ✅ Scan de players via vtable (153 players encontrados)
- ✅ Camera pointer validation (0x1B6-0x1B9)
- ✅ Overlay tkinter com radar funcional
- ✅ Coordenadas de players em tempo real

---

## SEÇÃO 2: OFFSETS DO ARMA 3 (BUILD 2.22)

### Player Structure
```
+0x000: float X
+0x004: float Z_height
+0x008: float Y_north
+0x0D0: QWORD vtable_pointer (0x1C18CA8)
+0x1D8: QWORD camera_obj_ptr
```

### Camera Singleton
```
0x1B000010044 (estável entre sessões)
ViewProj: camera+0x100 (PODE ESTAR ERRADO - testar 0x160)
```

### W2S Formula
```
cx = M[0]*x + M[1]*y + M[2]*z + M[3]
cy = M[4]*x + M[5]*y + M[6]*z + M[7]
cw = M[12]*x + M[13]*y + M[14]*z + M[15]
screen_x = (cx/cw * W/2) + W/2
screen_y = (H/2) - (cy/cw * H/2)
```

### Entity Validation (Anti-Junk)
```python
def validate_player(base, mod_base):
    vt = read_qword(base + 0xD0)
    if vt != mod_base + 0x1C18CA8: return False
    x,z,y = read_floats(base, 12)
    if not(100<x<50000 and 100<y<50000 and 0<z<2000): return False
    cam = read_qword(base + 0x1D8)
    if not(0x1B600000000<=cam<=0x1B900000000): return False
    return True
```

---

## SEÇÃO 3: OFFSET FINDING (6 MÉTODOS)

### 1. Pattern Scan
```python
pattern = b'\x48\x8B\x05\x00\x00\x00\x00'
idx = 0
while True:
    pos = code.find(pattern, idx)
    if pos < 0: break
    addr = base + pos
    print("Found at 0x%x" % addr)
    idx = pos + 1
```

### 2. RIP-relative Offset
```
48 8D 05 xx xx xx xx = LEA RAX, [RIP + disp32]
target = current_addr + 7 + displacement
```

### 3. VTable Match
```python
vtpack = struct.pack('<Q', module_base + 0x1C18CA8)
pos = data.find(vtpack)
player_base = region_base + pos - 0xD0
```

### 4. Cross-Reference (xref)
```
Procura CALL/JMP pra endereço conhecido
Sobe a call chain pra achar o caller
```

### 5. Hardware Breakpoint
```
DR0-DR3: 4 hardware breakpoints
DR7: control register
Quando dispara, analisa call stack
```

### 6. Entity List Traversal
```
GameState -> EntityList -> Entity[0] -> Entity[1] -> ...
Mais eficiente que vtable scan
```

---

## SEÇÃO 4: FILTROS ANTI-JUNK

### 6 Filtros Comprovados
```
1. VTable Validation (99.9%)
2. Coordinate Range (95%)
3. Camera Pointer (98%)
4. Cross-Validation (99%)
5. Temporal Consistency (97%)
6. Deduplication (<10m)
```

### Código de Validação
```python
def validate_player(base, mod_base):
    vt = read_qword(base + 0xD0)
    if vt != mod_base + 0x1C18CA8: return False
    x,z,y = read_floats(base, 12)
    if not(100<x<50000 and 100<y<50000 and 0<z<2000): return False
    cam = read_qword(base + 0x1D8)
    if not(0x1B600000000<=cam<=0x1B900000000): return False
    for p in players:
        if abs(x-p.x)<10 and abs(y-p.y)<10: return False
    return True
```

---

## SEÇÃO 5: BATTLLEYE

### Como funciona:
- Driver kernel BEDaisy.sys
- Verifica handles (PROCESS_VM_READ)
- Memory pattern scans
- Integrity checks periódicos
- PiDDBCacheTable verification

### O que bloqueia:
- VirtualAllocEx (erro 5: ACCESS_DENIED)
- CreateRemoteThread em processos protegidos
- Drivers não-assinados

### O que NÃO bloqueia:
- MmCopyVirtualMemory (kernel read)
- Leitura via driver KPRL (já funciona)
- DMA (hardware-based)

---

## SEÇÃO 6: BINARY ANALYSIS (ARM3_X64.EXE)

### Dados do Scan
```
.text: 27.8 MB @ 0x140001000
je patterns: 742
jne patterns: 34
LEA RIP-relative: 4547
Total funcoes: 79.760
```

### Seções do PE
```
.text    VAddr=0x00001000 Size=27.8MB
.rdata   VAddr=0x01A8E000 Size=6.3MB
.data    VAddr=0x0208E000 Size=2.0MB
.pdata   VAddr=0x02279000 Size=1.3MB
```

---

## SEÇÃO 7: LINKS E RECURSOS

### GitHub Repos
- GOESP (danielkrupinski): Cross-platform ESP com ImGui
- battleye-user-mode-bypass: Bypass via CreateFileW hook
- kernelmodeinjector: Kernel-mode DLL injector
- BEKernelDriverUpdated: Kernel driver bypass

### Tools
- Ghidra (gratuito): RE + decompilation
- Cheat Engine: Memory scanning
- x64dbg: Debug + disassembly
- Process Hacker: Process analysis

### Fontes de Estudo
- gamehacking.academy (8 tutoriais completos)
- Microsoft Docs (ReadProcessMemory, VirtualAllocEx, etc.)
- unknowncheats (via Brave snippets)
- codereversing.com (ESP + DLL injection series)