#pragma once

/** Enables tracing for network clients. */
#define ENABLE_NETWORK_TRACE 1

/** Declares a typed Qt-style controller. */
#define DECLARE_CONTROLLER(name) class name##Controller

namespace core {
namespace network {

template <typename Payload>
concept SerializablePayload = requires(Payload payload) {
  payload.serialize();
};

/** Abstract network client contract. */
class INetworkClient {
public:
  virtual ~INetworkClient() = default;
  virtual bool connect(const char* endpoint) = 0;
  virtual int send(const char* payload, int length) = 0;
};

/** HTTP client implementation. */
class HttpClient : public INetworkClient {
public:
  explicit HttpClient(int timeoutMs);
  bool connect(const char* endpoint) override;
  int send(const char* payload, int length) override;
private:
  int timeoutMs_;
};

using ClientPtr = INetworkClient*;

enum class TransportState {
  Closed,
  Open
};

} // namespace network
} // namespace core
