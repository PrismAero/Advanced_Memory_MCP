/** Maximum packet bytes accepted by the device transport. */
#define MAX_PACKET_BYTES 4096

/** Declare a device interface by name. */
#define DECLARE_DEVICE_INTERFACE(name) struct name##_interface

#ifdef ENABLE_DIAGNOSTICS
#define DIAG_FLAG 1
#endif

typedef unsigned long device_id_t;

/** Runtime device status. */
typedef enum DeviceStatus {
  DEVICE_OK = 0,
  DEVICE_ERROR = 1
} DeviceStatus;

/** Device handle visible to consumers. */
typedef struct DeviceHandle {
  device_id_t id;
  DeviceStatus status;
} DeviceHandle;

/** Open a device by id. */
DeviceHandle* open_device(device_id_t id);
