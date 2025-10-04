# Documind User Interface Guide

This guide describes the user interface and interactions in the Documind extension.

## Main Viewer Interface

```
┌─────────────────────────────────────────────────────────────────┐
│  ◄  Page 1 / 10  ►     -  100%  +                    [Toolbar]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                           │   │
│  │                                                           │   │
│  │                   PDF CONTENT                             │   │
│  │                   Rendered Here                           │   │
│  │                   (Canvas)                                │   │
│  │                                                           │   │
│  │                                                           │   │
│  │                                                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

┌──┐  ← Sidebar Toggle (hover or click)
│☰ │
└──┘
```

## Toolbar Elements

### Navigation Section
```
┌─────────────────────────────┐
│  ◄   Page 1 / 10   ►       │
│  ↑    ↑    ↑      ↑         │
│  │    │    │      └─ Next   │
│  │    │    └─ Page Count    │
│  │    └─ Current Page       │
│  └─ Previous Button         │
└─────────────────────────────┘
```

### Zoom Controls
```
┌─────────────────┐
│  -   100%   +   │
│  ↑    ↑     ↑   │
│  │    │     └─ Zoom In   │
│  │    └─ Current Zoom    │
│  └─ Zoom Out              │
└─────────────────┘
```

## Sidebar Interface

### Closed State (Default)
```
┌──┐
│☰ │  ← Toggle button visible on left edge
└──┘
```

### Open State
```
┌─────────────────────────────────┐
│  Table of Contents         [×]  │  ← Header with close button
├─────────────────────────────────┤
│                                  │
│  ┌────────────────────────────┐ │
│  │ Introduction               │ │  ← TOC Item
│  │ Page 1                     │ │
│  └────────────────────────────┘ │
│                                  │
│  ┌────────────────────────────┐ │
│  │ Background                 │ │  ← TOC Item (Active)
│  │ Page 3                     │ │
│  └────────────────────────────┘ │  Blue left border
│                                  │
│  ┌────────────────────────────┐ │
│  │ Methodology                │ │  ← TOC Item
│  │ Page 7                     │ │
│  └────────────────────────────┘ │
│                                  │
│  ┌────────────────────────────┐ │
│  │ Results                    │ │  ← TOC Item
│  │ Page 12                    │ │
│  └────────────────────────────┘ │
│                                  │
└─────────────────────────────────┘
```

## Settings Page

```
┌───────────────────────────────────────────────────────────┐
│                                                             │
│  Documind Settings                                          │
│  Configure API keys for enhanced features                   │
│                                                             │
│  ┌───────────────────────────────────────────────────┐    │
│  │ ℹ️ About API Keys                                  │    │
│  │ API keys are optional. Without them, Documind     │    │
│  │ will use local fallback methods.                  │    │
│  └───────────────────────────────────────────────────┘    │
│                                                             │
│  Chunkr.ai API Key (Optional)                              │
│  ┌───────────────────────────────────────────────────┐    │
│  │ ••••••••••••••••                                  │    │
│  └───────────────────────────────────────────────────┘    │
│  Get your API key from chunkr.ai                           │
│                                                             │
│  Google Gemini API Key (Optional)                          │
│  ┌───────────────────────────────────────────────────┐    │
│  │ ••••••••••••••••                                  │    │
│  └───────────────────────────────────────────────────┘    │
│  Get your API key from Google AI Studio                    │
│                                                             │
│  ┌─────────────────┐                                       │
│  │  Save Settings  │                                       │
│  └─────────────────┘                                       │
│                                                             │
└───────────────────────────────────────────────────────────┘
```

## Color Scheme

### Dark Theme (Default)
- **Background**: `#2b2b2b` (Dark gray)
- **Toolbar**: `#1a1a1a` (Darker gray)
- **Sidebar**: `#1a1a1a` (Darker gray)
- **Text**: `#ffffff` (White)
- **Accent**: `#4a9eff` (Blue)
- **Hover**: `#3a3a3a` (Medium gray)

### UI Elements
- **Buttons**: Gray with hover effect
- **Active Item**: Blue left border
- **Canvas**: White background for PDF
- **Toggle**: Dark with hover expansion

## Interactions

### Mouse Interactions

1. **Navigation Buttons**
   - Click "◄" to go to previous page
   - Click "►" to go to next page
   - Buttons disabled at boundaries

2. **Zoom Buttons**
   - Click "-" to zoom out (min 50%)
   - Click "+" to zoom in (max unlimited)
   - Percentage updates dynamically

3. **Sidebar Toggle**
   - Click "☰" button to open/close
   - Hover near left edge to reveal
   - Click "×" to close sidebar

4. **TOC Items**
   - Click any item to jump to that page
   - Active item highlighted in blue
   - Smooth scroll in sidebar

### Keyboard Shortcuts

- **← (Left Arrow)**: Previous page
- **→ (Right Arrow)**: Next page
- **+ (Plus)**: Zoom in
- **- (Minus)**: Zoom out

### Hover Effects

1. **Sidebar Toggle**
   ```
   Default:  ┌──┐
             │☰ │  (40px wide)
             └──┘
   
   Hover:    ┌────┐
             │ ☰  │  (50px wide, lighter)
             └────┘
   ```

2. **TOC Items**
   ```
   Default:  ┌────────────────────────────┐
             │ Introduction               │
             │ Page 1                     │
             └────────────────────────────┘
   
   Hover:    ┌────────────────────────────┐
             │ Introduction               │  (Lighter bg)
             │ Page 1                     │  (Blue border)
             └────────────────────────────┘
   ```

3. **Buttons**
   ```
   Default:  [ ◄ ]  (Dark gray)
   Hover:    [ ◄ ]  (Lighter gray)
   Disabled: [ ◄ ]  (50% opacity)
   ```

## Animations

### Sidebar Open/Close
- **Duration**: 0.3 seconds
- **Easing**: Ease in-out
- **Movement**: Slide from left

### Hover Effects
- **Duration**: 0.2 seconds
- **Easing**: Linear
- **Properties**: Background color, width

### Page Transitions
- **Duration**: Instant (render time)
- **Effect**: Canvas redraw

## Responsive Behavior

### Canvas Scaling
- PDF rendered at current zoom level
- Canvas size matches viewport
- High-quality rendering maintained

### Sidebar Width
- Fixed at 320px when open
- Hides completely when closed
- Z-index above main content

### Toolbar
- Fixed at top
- Full width
- Shadow for depth

## Loading States

### Initial Load
```
┌─────────────────────────────────────────┐
│  Loading PDF...                          │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │                                    │ │
│  │     [Spinner or blank canvas]      │ │
│  │                                    │ │
│  └────────────────────────────────────┘ │
│                                          │
└─────────────────────────────────────────┘
```

### TOC Loading
```
┌─────────────────────────────────┐
│  Table of Contents         [×]  │
├─────────────────────────────────┤
│                                  │
│  Loading table of contents...    │
│                                  │
└─────────────────────────────────┘
```

### Error States
```
┌─────────────────────────────────┐
│  Table of Contents         [×]  │
├─────────────────────────────────┤
│                                  │
│  ❌ Failed to generate TOC       │
│  Check API keys or try again     │
│                                  │
└─────────────────────────────────┘
```

## Accessibility

### Keyboard Navigation
- All controls accessible via keyboard
- Tab order follows logical flow
- Focus indicators visible

### Semantic HTML
- Proper heading hierarchy
- Button elements for actions
- Aria labels where needed

### Color Contrast
- White on dark gray (high contrast)
- Blue accent clearly visible
- Error states use red

## Mobile Considerations

### Current Implementation
- Optimized for desktop Chrome
- Touch events not specifically handled
- Sidebar toggle works on mobile

### Future Enhancements
- Touch gestures for page turns
- Pinch to zoom
- Mobile-optimized layout
- Bottom toolbar option

## Tips for Best Experience

1. **Enable File Access**: For local PDFs
2. **Use Keyboard Shortcuts**: Faster navigation
3. **Configure API Keys**: Better TOC quality
4. **Wait for Processing**: Large PDFs take time
5. **Check Console**: For debugging issues

## UI Features Summary

✅ **Clean Interface**: Minimal, distraction-free
✅ **Dark Theme**: Easy on eyes for reading
✅ **Smooth Animations**: Professional feel
✅ **Intuitive Controls**: Easy to understand
✅ **Keyboard Shortcuts**: Power user features
✅ **Hover Interactions**: Discoverable features
✅ **Responsive Feedback**: Visual state changes
✅ **Error Handling**: Clear error messages
✅ **Loading States**: User knows what's happening
✅ **Accessible**: Keyboard and screen reader friendly
