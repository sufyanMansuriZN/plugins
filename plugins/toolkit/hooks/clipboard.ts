/**
 * A python3 script that puts a table on the X11 clipboard as text/html and as plain text at once,
 * through libX11, so nothing has to be installed. It reads `{"text": tsv, "html": html}` on stdin,
 * exits 0 once it owns the clipboard and serves from the background until another app takes it.
 * Exit 2: no X display. Exit 3: could not take the clipboard.
 */
export const X11_CLIPBOARD_PY = `import ctypes, ctypes.util, json, os, sys

data = json.load(sys.stdin)
x = ctypes.cdll.LoadLibrary(ctypes.util.find_library('X11') or 'libX11.so.6')

class Ev(ctypes.Structure):
    _fields_ = [('type', ctypes.c_int), ('pad', ctypes.c_long * 24)]

class SelReq(ctypes.Structure):
    _fields_ = [('type', ctypes.c_int), ('serial', ctypes.c_ulong), ('send_event', ctypes.c_int),
                ('display', ctypes.c_void_p), ('owner', ctypes.c_ulong), ('requestor', ctypes.c_ulong),
                ('selection', ctypes.c_ulong), ('target', ctypes.c_ulong), ('property', ctypes.c_ulong),
                ('time', ctypes.c_ulong)]

class SelNotify(ctypes.Structure):
    _fields_ = [('type', ctypes.c_int), ('serial', ctypes.c_ulong), ('send_event', ctypes.c_int),
                ('display', ctypes.c_void_p), ('requestor', ctypes.c_ulong), ('selection', ctypes.c_ulong),
                ('target', ctypes.c_ulong), ('property', ctypes.c_ulong), ('time', ctypes.c_ulong)]

x.XOpenDisplay.restype = ctypes.c_void_p
x.XInternAtom.restype = ctypes.c_ulong
x.XInternAtom.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
x.XCreateSimpleWindow.restype = ctypes.c_ulong
x.XCreateSimpleWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong] + [ctypes.c_int] * 4 + [ctypes.c_uint, ctypes.c_ulong, ctypes.c_ulong]
x.XDefaultRootWindow.restype = ctypes.c_ulong
x.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
x.XSetSelectionOwner.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong]
x.XGetSelectionOwner.restype = ctypes.c_ulong
x.XGetSelectionOwner.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x.XChangeProperty.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_void_p, ctypes.c_int]
x.XSendEvent.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_long, ctypes.c_void_p]
x.XNextEvent.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
x.XFlush.argtypes = [ctypes.c_void_p]

d = x.XOpenDisplay(None)
if not d:
    sys.exit(2)
atom = lambda n: x.XInternAtom(d, n.encode(), 0)
CLIPBOARD, TARGETS, ATOM, UTF8 = atom('CLIPBOARD'), atom('TARGETS'), atom('ATOM'), atom('UTF8_STRING')
plain = data['text'].encode()
html = data['html'].encode()
offers = {UTF8: (UTF8, plain), atom('text/plain;charset=utf-8'): (UTF8, plain), atom('text/plain'): (UTF8, plain),
          atom('STRING'): (atom('STRING'), plain), atom('TEXT'): (UTF8, plain), atom('text/html'): (atom('text/html'), html)}

w = x.XCreateSimpleWindow(d, x.XDefaultRootWindow(d), 0, 0, 1, 1, 0, 0, 0)
x.XSetSelectionOwner(d, CLIPBOARD, w, 0)
if x.XGetSelectionOwner(d, CLIPBOARD) != w:
    sys.exit(3)
x.XFlush(d)

# The clipboard lives as long as its owner, so the owner leaves the caller and serves until replaced.
if os.fork():
    os._exit(0)
os.setsid()
if os.fork():
    os._exit(0)
null = os.open(os.devnull, os.O_RDWR)
for fd in (0, 1, 2):
    os.dup2(null, fd)

ev = Ev()
while True:
    x.XNextEvent(d, ctypes.byref(ev))
    if ev.type == 29:  # SelectionClear: another app owns the clipboard now
        break
    if ev.type != 30:  # SelectionRequest
        continue
    req = ctypes.cast(ctypes.byref(ev), ctypes.POINTER(SelReq)).contents
    prop = req.property or req.target
    if req.target == TARGETS:
        atoms = (ctypes.c_ulong * (len(offers) + 1))(TARGETS, *offers)
        x.XChangeProperty(d, req.requestor, prop, ATOM, 32, 0, atoms, len(atoms))
    elif req.target in offers:
        kind, body = offers[req.target]
        x.XChangeProperty(d, req.requestor, prop, kind, 8, 0, body, len(body))
    else:
        prop = 0
    note = SelNotify(31, 0, 1, d, req.requestor, req.selection, req.target, prop, req.time)
    x.XSendEvent(d, req.requestor, 0, 0, ctypes.byref(note))
    x.XFlush(d)
`
