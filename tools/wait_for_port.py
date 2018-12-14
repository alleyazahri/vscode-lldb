from __future__ import print_function
import sys
import time
import socket

port = int(sys.argv[1])
print('Waiting for port %d' % port)

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
while True:
    result = sock.connect_ex(('127.0.0.1', port))
    if result == 0:
        break
    time.sleep(0.5)

print('Connected')

sock.shutdown(socket.SHUT_WR)
sock.close()

print('Exiting')
