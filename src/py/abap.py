from pyrfc import Connection, ABAPApplicationError, ABAPRuntimeError, LogonError, CommunicationError

class SAP:
    def __init__(self,_abap_system):
        self.abap_system = _abap_system

    def connection(self):
        try:
            conn = Connection(**self.abap_system)
            result = conn.call('STFC_CONNECTION', REQUTEXT=u'Hello SAP!')
            return result
        except CommunicationError:
            print ("Could not connect to server.")
            raise
        except LogonError:
            print ("Could not log in. Wrong credentials?")
            raise
        except (ABAPApplicationError, ABAPRuntimeError):
            print ("An error occurred.")
            raise  
          
    def getZetProgram(self):
        try:
            conn = Connection(**self.abap_system)
            result = conn.call('STFC_CONNECTION', REQUTEXT=u'Hello SAP!')
            return result
        except CommunicationError:
            print ("Could not connect to server.")
            raise
        except LogonError:
            print ("Could not log in. Wrong credentials?")
            raise
        except (ABAPApplicationError, ABAPRuntimeError):
            print ("An error occurred.")
            raise      