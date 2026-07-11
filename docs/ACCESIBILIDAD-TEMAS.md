# 🎨 Temas Accesibles - Free JT7 Extension

Esta extensión incluye tres temas personalizados diseñados específicamente para **mejorar la experiencia visual** en personas con diferentes necesidades:

---

## 📋 Temas Disponibles

### 1. 🌙 **Alto Contraste Oscuro**
**Ideal para:** Personas con baja visión, miopía, sensibilidad a la luz

- **Fondo:** Negro puro (#000000)
- **Texto:** Blanco brillante (#FFFFFF)
- **Contraste:** 21:1 (máximo)
- **Colores:** Azul (#00CCFF), Amarillo (#FFFF00), Verde (#00FF00)

**Ventajas:**
- ✅ Reduce fatiga ocular en ambientes oscuros
- ✅ Máximo contraste (WCAG AAA)
- ✅ Ideal para personas con astigmatismo
- ✅ Protege la vista en sesiones largas

---

### 2. ☀️ **Alto Contraste Claro**
**Ideal para:** Personas con hipermetropía, daltonismo leve, deficit de atención visual

- **Fondo:** Blanco puro (#FFFFFF)
- **Texto:** Negro (#000000)
- **Contraste:** 21:1 (máximo)
- **Colores:** Azul (#0066CC), Naranja (#FF8800), Verde (#008800)

**Ventajas:**
- ✅ Máximo contraste para lectura clara
- ✅ Ideal para ambientes bien iluminados
- ✅ Colores alternativos para mejor distinción
- ✅ Excelente para documentación

---

### 3. 🔵 **Amigable para Daltónicos**
**Ideal para:** Daltonismo rojo-verde, tritanomía, acromatopsia

- **Fondo:** Azul oscuro (#0A0E27)
- **Texto:** Azul claro (#E8EAF6)
- **Colores:** Azul (#81D4FA), Amarillo (#FFD54F), Verde (#AED581)
- **Evita:** Rojo/Verde (incompatibles con daltonismo)

**Ventajas:**
- ✅ Usa paleta azul-amarillo (universalmente distinguible)
- ✅ Elimina confusión rojo-verde
- ✅ Optimizado para tritanomía
- ✅ Contraste de 15:1 (WCAG AA)

---

## 🚀 Cómo Cambiar de Tema

### En VS Code:

1. **Opción 1 - Mediante Paleta de Comandos:**
   - Presiona `Ctrl + Shift + P`
   - Escribe: `"Preferencias: Tema de color"`
   - Selecciona uno de los temas Free JT7

2. **Opción 2 - Mediante Configuración:**
   - `File` → `Preferences` → `Theme` → `Color Theme`
   - Busca "Free JT7"

### En settings.json (configuración manual):
```json
{
  "workbench.colorTheme": "Free JT7 - Alto Contraste Oscuro"
}
```

---

## ⚙️ Personalización Adicional

### Aumentar Tamaño de Fuente
Si necesitas mayor legibilidad, ve a `File → Preferences → Settings`:

```json
{
  "editor.fontSize": 18,
  "editor.lineHeight": 1.8,
  "editor.fontFamily": "Consolas, 'Courier New', monospace"
}
```

### Recomendaciones por Problema Visual:

| Problema | Tema Recomendado | Tamaño Fuente | Espaciado Línea |
|----------|-----------------|----------------|-----------------|
| **Baja Visión** | Alto Contraste Oscuro | 16-20px | 1.8 |
| **Hipermetropía** | Alto Contraste Claro | 14-16px | 1.6 |
| **Daltonismo R-G** | Daltónico Friendly | 14-16px | 1.6 |
| **Astigmatismo** | Alto Contraste Oscuro | 16px | 1.8 |
| **Fatiga Ocular** | Alto Contraste Oscuro | 18px | 2.0 |

---

## 📊 Especificaciones de Contraste

Todos los temas cumplen con estándares de accesibilidad WCAG:

| Tema | Contraste | Estándar WCAG |
|------|-----------|---------------|
| **Alto Contraste Oscuro** | 21:1 | ✅ AAA |
| **Alto Contraste Claro** | 21:1 | ✅ AAA |
| **Daltónico Friendly** | 15:1 | ✅ AA / AAA* |

*Excepto en algunas combinaciones de colores secundarios

---

## 🔧 Editor Adicional - Variables de Entorno

Para optimizar aún más tu experiencia visual, puedes agregar a tu `settings.json`:

```json
{
  "editor.wordWrap": "on",
  "editor.lineHeight": 1.8,
  "editor.cursorStyle": "block",
  "editor.cursorBlinking": "smooth",
  "editor.guides.indentation": true,
  "editor.bracketPairColorization.enabled": true,
  "editor.renderWhitespace": "all"
}
```

---

## 💡 Tips de Accesibilidad

1. **Usar luz de fondo en ambientes oscuros**
   - Ayuda a reducir el deslumbramiento
   - Usa el tema "Alto Contraste Oscuro"

2. **Descansos regulares (Regla 20-20-20)**
   - Cada 20 minutos: mira algo a 20 metros por 20 segundos

3. **Fuente monoespaciada preferida**
   - "Consolas" (Windows)
   - "Monaco" (Mac)
   - "Liberation Mono" (Linux)

4. **Modo de lectura**
   - Aumenta `editor.lineHeight` a 2.0+ para mejor legibilidad

5. **Desactivar animaciones** (si causan mareos)
```json
{
  "workbench.enableExperiments": false,
  "editor.cursorBlinking": "solid"
}
```

---

## 📞 Soporte y Feedback

Si necesitas ajustar los colores, contraste o cualquier parámetro de accesibilidad, puedes:

- 📝 Abre una issue en el repositorio
- 💬 Sugiere colores o paletas alternativas
- 🎨 Solicita temas personalizados para condiciones específicas

**Tu vista importa. Estos temas fueron diseñados pensando en ti.** 👁️✨

---

## 📚 Referencias de Accesibilidad

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Color Blindness Simulator](https://www.color-blindness.com/)
- [Accessible Colors Tool](https://accessible-colors.com/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
