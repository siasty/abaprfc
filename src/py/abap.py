from pyrfc import Connection, ABAPApplicationError, ABAPRuntimeError, LogonError, CommunicationError, RFCError

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
          
    def checkProgramExist(self,programName):
        try:
            conn = Connection(**self.abap_system)
            result = conn.call('RPY_EXISTENCE_CHECK_PROG',NAME=programName)
            return True
        except RFCError as e:
            return False
          
          
    def getZetProgram(self):
        try:
            conn = Connection(**self.abap_system)
            result = conn.call('STFC_CONNECTION', REQUTEXT=u'Hello SAP!')
            return result
        except RFCError as e:
            print ("RFCError: "+ e)
            raise
        except CommunicationError:
            print ("Could not connect to server.")
            raise
        except LogonError:
            print ("Could not log in. Wrong credentials?")
            raise
        except (ABAPApplicationError, ABAPRuntimeError):
            print ("An error occurred.")
            raise      