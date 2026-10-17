// Icône d'Essence.app : pompe à essence dessinée en vecteur (aucune ressource tierce), PNG 1024×1024.
import AppKit

let size: CGFloat = 1024
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                           bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

func rgb(_ hex: Int, _ a: CGFloat = 1) -> NSColor {
  NSColor(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: a)
}
func rr(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat) -> NSBezierPath {
  NSBezierPath(roundedRect: NSRect(x: x, y: y, width: w, height: h), xRadius: r, yRadius: r)
}

// Fond : grille d'icône macOS (824 px centrés), gris sombre du widget.
let tile = rr(100, 100, 824, 824, 185)
NSGradient(starting: rgb(0x3d3d41), ending: rgb(0x1c1c1e))!.draw(in: tile, angle: -90)

// Ombre portée douce sous la pompe.
NSGraphicsContext.saveGraphicsState()
let shadow = NSShadow(); shadow.shadowColor = rgb(0x000000, 0.45); shadow.shadowBlurRadius = 40; shadow.shadowOffset = NSSize(width: 0, height: -14)
shadow.set()

// Tuyau en J : sort du flanc droit en bas, s'écarte puis monte jusqu'au pistolet.
let metal = rgb(0xd1d1d6)
let hose = NSBezierPath()
hose.move(to: NSPoint(x: 600, y: 330))
hose.curve(to: NSPoint(x: 724, y: 420), controlPoint1: NSPoint(x: 690, y: 320), controlPoint2: NSPoint(x: 724, y: 350))
hose.line(to: NSPoint(x: 724, y: 560))
hose.lineWidth = 30; hose.lineCapStyle = .round; hose.lineJoinStyle = .round
metal.setStroke(); hose.stroke()

// Socle.
rgb(0x8e8e93).setFill(); rr(268, 198, 380, 52, 22).fill()

// Corps de la pompe (vert « dispo » du widget, dégradé).
let body = rr(300, 232, 316, 540, 54)
NSGradient(starting: rgb(0x4be37a), ending: rgb(0x22a447))!.draw(in: body, angle: -90)
NSGraphicsContext.restoreGraphicsState()

// Écran de prix : fond sombre, trois « chiffres » en barres claires.
rgb(0x1c1c1e).setFill(); rr(342, 560, 232, 150, 26).fill()
rgb(0x30d158).setFill()
for (i, w) in [CGFloat(52), 52, 52].enumerated() {
  rr(372 + CGFloat(i) * 62, 640, w, 36, 9).fill()
}
rgb(0x30d158, 0.45).setFill(); rr(372, 592, 176, 22, 9).fill()

// Goutte blanche au centre du corps.
let drop = NSBezierPath()
let cx: CGFloat = 458, cy: CGFloat = 380, r: CGFloat = 62
drop.move(to: NSPoint(x: cx, y: cy + r * 2.15))
drop.curve(to: NSPoint(x: cx + r, y: cy), controlPoint1: NSPoint(x: cx + r * 0.25, y: cy + r * 1.45), controlPoint2: NSPoint(x: cx + r, y: cy + r * 0.85))
drop.appendArc(withCenter: NSPoint(x: cx, y: cy), radius: r, startAngle: 0, endAngle: 180, clockwise: true)
drop.curve(to: NSPoint(x: cx, y: cy + r * 2.15), controlPoint1: NSPoint(x: cx - r, y: cy + r * 0.85), controlPoint2: NSPoint(x: cx - r * 0.25, y: cy + r * 1.45))
drop.close()
rgb(0xffffff, 0.95).setFill(); drop.fill()

// Pistolet accroché sur le flanc droit : support, poignée, bec incliné vers la pompe.
metal.setFill(); metal.setStroke()
rr(606, 628, 50, 44, 14).fill()                 // support
rr(694, 548, 60, 150, 24).fill()                // poignée
let spout = NSBezierPath()
spout.move(to: NSPoint(x: 712, y: 680))
spout.line(to: NSPoint(x: 650, y: 740))
spout.lineWidth = 32; spout.lineCapStyle = .round
spout.stroke()

NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
